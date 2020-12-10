import GlTiledTextureAbstract from './GlTiledTextureAbstract.js';

/**
 * @module ol/source/GlTiles
 */

/**
 * @typedef {Object} Options
 * @param {import("geotiff").default|Promise<import("geotiff").default>} tiff A GeoTIFF.js instance, or a Promise to such.
 * @param {number} [sample=0] Which sample (AKA channel) to query (zero-indexed). For WebGL1
 * compatibility, only one channel per instance is allowed.
 * @param {number} [fillValue=-999] Value to be used for pixels with no data.
 * @param {string} [fetchFuncName] Name of the texture fetch function to be defined in the fragment shader code
 * @param {import("geotiff").Pool} [pool] a GeoTIFF.js worker pool
 */

export default class GlTiledTextureGeoTiff extends GlTiledTextureAbstract {
  /**
   * @param {Options=} options
   * A wrapper of GeoTIFF.js functionality. Extracts data from *one* GeoTIFF file
   * in such a way that can be fed to a GlTiles source.
   */
  constructor({tiff, fetchFuncName, sample, fillValue, pool}) {
    super(fetchFuncName);
    this.sample_ = sample;
    this.fillValue_ = fillValue;
    this.pool_ = pool;

    if (!('getImage' in tiff)) {
      // A Promise to a GeoTIFF was passed
      this.tiff_ = tiff.then((loadedTiff) =>
        loadedTiff.getImage().then(this.loadImage_.bind(this))
      );
    } else {
      // A resolved GeoTIFF was passed
      this.tiff_ = tiff.getImage().then(this.loadImage_.bind(this));
    }
  }

  loadImage_(img) {
    // Caches the pixel width & heigth, and the geographical bbox of the geotiff.
    this.width_ = img.getWidth();
    this.height_ = img.getHeight();
    this.bbox_ = img.getBoundingBox();
    this.bboxWidth_ = this.bbox_[2] - this.bbox_[0];
    this.bboxHeight_ = this.bbox_[3] - this.bbox_[1];

    // Sanity check. The (zero-indexed) requested sample must be within the number
    // of available samples.
    if (this.sample_ >= img.getSamplesPerPixel()) {
      return Promise.reject(
        'Requested sample ' +
          Number(this.sample_) +
          ', but only ' +
          img.getSamplesPerPixel() +
          ' samples are available'
      );
    }

    // Build up an empty tile of the appropriate TypedArray to speed up out-of-bounds queries
    const dir = img.getFileDirectory();
    const bits = dir.BitsPerSample[this.sample_];
    const format = dir.SampleFormat[this.sample_]; // 1 = uint; 2 = int; 3 = float
    if (bits === 8 && format === 1) {
      this.emptyData_ = new Uint8Array(this.width_ * this.height_);
    } else if (bits === 16 && format === 1) {
      this.emptyData_ = new Uint16Array(this.width_ * this.height_);
    } else if (bits === 16 && format === 2) {
      this.emptyData_ = new Int16Array(this.width_ * this.height_);
    } else {
      return Promise.reject(
        'FIXME: could not create empty tile data for GeoTIFF sample format, or unsupported (32-bit) format'
      );
    }
    this.emptyData_.fill(this.fillValue_);

    /// TODO: research whether it's possible to do a sanity check between
    /// img.getFileDirectory().GeoAsciiParams and the parent GLTiles source's
    /// .projection.

    return img;
  }

  /**
   * @inheritDoc
   */
  getTiledData({tileGrid, tileCoord, tileSize, tileExtent}) {
    return this.tiff_.then((img) => {
      // TODO: sanity check on the GeoTIFF CRS vs the given TileGrid.

      // Calculate the pixel coords to be fetched from the projected coords and the image size
      const x1 =
        ((tileExtent[2] - this.bbox_[0]) / this.bboxWidth_) * this.width_;
      const x2 =
        ((tileExtent[0] - this.bbox_[0]) / this.bboxWidth_) * this.width_;
      const y1 =
        ((tileExtent[3] - this.bbox_[1]) / this.bboxHeight_) * this.height_;
      const y2 =
        ((tileExtent[1] - this.bbox_[1]) / this.bboxHeight_) * this.height_;

      if (x1 < 0 || x2 > this.width_ || y1 < 0 || y2 > this.height_) {
        // Out of bounds, return all zeroes
        return this.emptyData_;
      }
      return img
        .readRasters({
          window: [x2, this.height_ - y1, x1, this.height_ - y2].map((i) =>
            Math.round(i)
          ),
          width: tileSize[0],
          height: tileSize[1],
          resampleMethod: 'nearest',
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
   * @param {String} uniformName BBox of the tile, in the map's display CRS.
   * @return {Promise<String>}
   *
   * Returns a string containing valid GLSL shader code, defining a function
   * with the name provided at instantiation time, taking data from the uniform name
   * passed at run time.
   *
   * This wraps over any 16- or 32-bit data packed into the WebGL1 4x8-bit RGBA texture.
   */
  getFetchFunctionDef(uniformName) {
    return this.tiff_.then((img) => {
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

    //     return Promise.resolve(`float ${this.fetchFuncName_}(vec2 texelCoords) {
    //       return ${uniformName}.x;
    //     }`);
  }
}
