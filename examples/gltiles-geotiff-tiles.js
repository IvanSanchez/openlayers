import GlTiledTextureGeoTiffTiles from '../src/ol/source/GlTiledTexture/GlTiledTextureGeoTiffTiles.js';
import Map from '../src/ol/Map.js';
import TileGrid from '../src/ol/tilegrid/TileGrid.js';
import TileLayer from '../src/ol/layer/Tile.js';
import TileWMS from '../src/ol/source/TileWMS.js';
import View from '../src/ol/View.js';
import {GlTiles, XYZ} from '../src/ol/source.js';

import {Worker} from 'threads';

// This example depends on a global variable "GeoTIFF" being defined.
// This is done via a <script src="https://unpkg.com/geotiff..."> tag
// It'd be also possible to do a "import * as GeoTIFF from 'geotiff';"
/* global GeoTIFF */

// Creating a GeoTIFF worker Pool is not needed, but makes decoding feel faster
const pool = new GeoTIFF.Pool(
  navigator.hardwareConcurrency,
  new Worker(
    'https://unpkg.com/geotiff@1.0.0-beta.16/dist-browser/decoder.worker.1936c0d9.js'
  )
);

// These non-square GeoTIFF tiles need a custom tilegrid - forcing level 0 for
// the top-level 512x256px tile, and limiting the number of available zoom levels.

const tileGrid = new TileGrid({
  extent: [-180, -90, 180, 90],
  origin: [-180, 90],
  resolutions: [360 / 512, 180 / 512, 90 / 512, 45 / 512, 22.5 / 512],
  tileSizes: [
    [512, 256],
    [1024, 512],
    [1024, 1024],
    [1024, 1024],
    [1024, 1024],
  ],
});

const tiffTiles = new XYZ({
  url:
    'https://s2downloads.eox.at/demo/EOxCloudless/2019/rgbnir_16bit/{z}/{y}/{x}.tif',
  tileGrid: tileGrid,
  projection: 'EPSG:4326',
});

// tcr, tcg, tcb = True Colour Red/Green/Blue
// nir = Near InfraRed
// These tiles are 16-bit 4-sample RGB+NIR geotiff
const tcr = new GlTiledTextureGeoTiffTiles({
  xyz: tiffTiles,
  geotiffFactory: GeoTIFF.fromUrl,
  sample: 0,
  fillValue: -999,
  fetchFuncName: 'getTCR',
  pool: pool,
});
const tcg = new GlTiledTextureGeoTiffTiles({
  xyz: tiffTiles,
  geotiffFactory: GeoTIFF.fromUrl,
  sample: 1,
  fillValue: -999,
  fetchFuncName: 'getTCG',
  pool: pool,
});
const tcb = new GlTiledTextureGeoTiffTiles({
  xyz: tiffTiles,
  geotiffFactory: GeoTIFF.fromUrl,
  sample: 2,
  fillValue: -999,
  fetchFuncName: 'getTCB',
  pool: pool,
});
const nir = new GlTiledTextureGeoTiffTiles({
  xyz: tiffTiles,
  geotiffFactory: GeoTIFF.fromUrl,
  sample: 3,
  fillValue: -999,
  fetchFuncName: 'getNIR',
  pool: pool,
});

const rgbnirShader =
  '#line 1                                   \n' +
  'void main(void) {                                              \n' +
  '	// Fetch texel values for different bands                     \n' +
  '	// in the current texel coordinate (vTextureCoords.st)        \n' +
  '	// These values are in ranges like 0..4000, and must be       \n' +
  '	// normalized into the 0..1 range for display in GL.          \n' +
  '	float tcr = getTCR(vTextureCoords.st);                        \n' +
  '	float tcg = getTCG(vTextureCoords.st);                        \n' +
  '	float tcb = getTCB(vTextureCoords.st);                        \n' +
  '	float nir = getNIR(vTextureCoords.st);                        \n' +
  '                                                               \n' +
  ' if (tcr < 30.) { gl_FragColor = vec4(0.0); } else              \n' +
  ' {                                                             \n' +
  '	gl_FragColor = vec4(                                          \n' +
  '    tcr / 4000.,                                               \n' +
  '    tcg / 3000.,                                               \n' +
  '    tcb / 2000.,                                               \n' +
  '    1.0);                                                      \n' +
  ' }                                                             \n' +
  '}                                                              \n';

const glSource = new GlTiles({
  fragmentShader: rgbnirShader,
  textureSources: [tcr, tcg, tcb, nir],
  attributions:
    "<a href='https://s2maps.eu'>Sentinel-2 cloudless</a> by <a href='https://eox.at/'>EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2019)",
  uniforms: {},
});

const map = new Map({
  layers: [
    new TileLayer({
      source: new TileWMS({
        url: 'https://ahocevar.com/geoserver/wms',
        params: {
          'LAYERS': 'ne:NE1_HR_LC_SR_W_DR',
          'TILED': true,
        },
      }),
      opacity: 0.5,
    }),

    new TileLayer({
      source: glSource,
    }),
  ],
  target: 'map',
  view: new View({
    projection: 'EPSG:4326',
    center: [16, 46],
    zoom: 0,
  }),
});
