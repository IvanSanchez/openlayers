/**
 * @module ol/source/GlTiles
 */

/**
 * @typedef {Object} TiledDataParameters
 * @param {import("../../tilegrid/TileGrid.js").default} [tileGrid] Tile grid.
 * @param {import("../../tilecoord.js").TileCoord} tileCoord Tile coordinate (for the given TileGrid).
 * @param {import("../../size.js").Size} tileSize Tile size.
 * @param {import("../../extent.js").Extent} tileExtent BBox of the tile, in the map's display CRS.
 */
/**
 * @typedef {Promise<Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Uint8ClampedArray | Float32Array | Float64Array | ImageData>} TiledData
 */

export default class GlTiledTextureAbstract {
  /**
   * @param {string} fetchFuncName Name of the texture fetch function to be defined in the fragment shader code
   *
   * The basis of concrete GlTiledTextures. Needs subclasses to implement the getTiledData() method.
   */
  constructor(fetchFuncName) {
    /**
     * @protected
     * @type {String}
     *
     */
    this.fetchFuncName_ = fetchFuncName;
  }

  /**
   * @param {TiledDataParameters} tiledDataParameters Tile grid, coordinates, size and extent of the needed tile.
   *
   * @return {Promise<TiledData>}
   *
   * Must return a Promise to a TypedArray (Uint8Array, Float32Array, etc) for the given
   * tile grid/coordinate/extents.
   */
  getTiledData({tileGrid, tileCoord, tileSize, tileExtent}) {
    return Promise.reject();
  }

  /**
   * @param {String} uniformName BBox of the tile, in the map's display CRS.
   * @return {String | Promise<String>}
   *
   * Must return a string containing valid GLSL shader code, defining a function
   * with the name provided at instantiation time, taking data from the uniform name
   * passed at run time.
   *
   * This is meant to be called only from a GLTiles source using this GlTiledTexture,
   * to ease reading 16- or 32-bit data packed into an 4x8-bit RGBA texture.
   */
  getFetchFunctionDef(uniformName) {
    if (!this.fetchFuncName_) {
      return '';
    }
    return Promise.resolve(`float ${this.fetchFuncName_}(vec2 texelCoords) {
      return texture2D(${uniformName}, texelCoords.st).x;
    }`);
  }
}
