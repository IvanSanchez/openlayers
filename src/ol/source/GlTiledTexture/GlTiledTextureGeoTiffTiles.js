/**
 * @module ol/source/GlTiledTexture/GlTiledTextureGeoTiffTiles
 */

import GlTiledTextureAbstract from './GlTiledTextureAbstract.js';

import LRUCache from '../../structs/LRUCache.js';

// Define a LRU cache for instances of GeoTIFF. A typical use case is to try to
// instantiate several GeoTIFFs based on the same URL, when there are several
// GlTiledTextureGeoTiffTiles for the same tile source. This happens when
// fetching several samples ("channels") from the same tileset.
const geotiffCache = new LRUCache(16);

/**
 * @typedef {Object} Options
 * @param {import("../TileImage.js").default} xyz Instance of TileImage / XYZ tile source for the Terrain-RGB tiles
 * @param {Function} geotiffFactory Factory function to create GeoTIFF instances from URLs. Should be `GeoTIFF.fromUrl`
 * @param {number} [sample=0] Which sample (AKA channel) to query (zero-indexed). For WebGL1
 * compatibility, only one channel per instance is allowed.
 * @param {number} [fillValue=-999] Value to be used for pixels with no data.
 * @param {string} [fetchFuncName] Name of the texture fetch function to be defined in the fragment shader code
 * @param {import("geotiff").Pool} [pool] a GeoTIFF.js worker pool
 * @api
 */

export default class GlTiledTextureGeoTiffTiles extends GlTiledTextureAbstract {
  /**
   * @param {Options=} options
   * A wrapper of GeoTIFF.js functionality. Extracts data from *one* GeoTIFF file
   * in such a way that can be fed to a GlTiles source.
   * @api
   */
  constructor({xyz, geotiffFactory, fetchFuncName, sample, fillValue, pool}) {
    super(fetchFuncName);
    this.sample_ = sample;
    this.fillValue_ = fillValue;
    this.factory_ = geotiffFactory;
    this.xyz_ = xyz;
    this.pool_ = pool;

    this.anyTile_ = new Promise((res, rej) => {
      this.resolveAnyTile_ = res;
    });
  }

  /**
   * @inheritDoc
   */
  getTiledData({tileGrid, tileCoord, tileSize, tileExtent}) {
    const urlTileCoord = this.xyz_.getTileCoordForTileUrlFunction(
      tileCoord /*, projection*/
    );
    const url = this.xyz_.tileUrlFunction(urlTileCoord);

    let instance;
    if (geotiffCache.containsKey(url)) {
      instance = geotiffCache.get(url);
    } else {
      instance = this.factory_(url);
      geotiffCache.set(url, instance);
      if (geotiffCache.canExpireCache()) {
        geotiffCache.pop();
      }
    }

    return instance
      .then((tiff) => tiff.getImage())
      .then((img) => {
        this.resolveAnyTile_(img);

        return img
          .readRasters({
            width: tileSize[0],
            height: tileSize[1],
            samples: [this.sample_],
            fillValue: this.fillValue_,
            pool: this.pool_,
          })
          .then((rasters) => {
            return rasters[0];
          });
      });
  }

  /**
   * @param {String} uniformName Name of the uniform bound to the texture unit which shall hold the data.
   * @return {Promise<String>}
   *
   * Returns a string containing valid GLSL shader code, defining a function
   * with the name provided at instantiation time, taking data from the uniform name
   * passed at run time.
   *
   * This wraps over any 16- or 32-bit data packed into the WebGL1 4x8-bit RGBA texture.
   */
  getFetchFunctionDef(uniformName) {
    return this.anyTile_.then((img) => {
      const dir = img.getFileDirectory();
      const bits = dir.BitsPerSample[this.sample_];
      const format = dir.SampleFormat[this.sample_]; // 1 = uint; 2 = int; 3 = float

      let body = '';

      if (bits === 8 && format === 1) {
        body = `return texel.x * 256.;`;
      } else if (bits === 8 && format === 2) {
        /// TODO: Check if .x > 128.0 and shift by -256.0??
        body = `return texel.x * 256.;`;
      } else if (bits === 16 && format === 1) {
        body = `return texel.x * 256. + texel.a * 65536.0;`;
      } else if (bits === 16 && format === 2) {
        /// TODO: Check if .y > 128.0 and shift by -256.0??
        body = `return texel.x * 256. + texel.a * 65536.0;`;
      } else {
        if (format === 1) {
          return Promise.reject(
            `GeoTIFF pixel format not yet implemented (${bits} bits, uint)`
          );
        } else if (format === 2) {
          return Promise.reject(
            `GeoTIFF pixel format not yet implemented (${bits} bits, int)`
          );
        } else if (format === 2) {
          return Promise.reject(
            `GeoTIFF pixel format not yet implemented (${bits} bits, float)`
          );
        } else {
          return Promise.reject(
            `GeoTIFF pixel format not yet implemented (${bits} bits, unknown uint/int/float)`
          );
        }
      }

      return `float ${this.fetchFuncName_}(vec2 texelCoords) {
        vec4 texel = texture2D(${uniformName}, texelCoords.st);
        ${body}
      }`;
    });
  }

  getTileGrid() {
    return this.xyz_.tileGrid;
  }

  getProjection() {
    return this.xyz_.getProjection();
  }
}
