/* eslint-disable no-console */

/*
  Externals is webpack's way to keep certain dependencies
  out of the compilation/chunking flow,
  and instead tell compiled code that they will be
  globally available in runtime from other ímported libraries, say from a CDN.

  This webpack file wraps the building those external libraries from existing packages.
  They are built into one separate chunk (TODO for later: multiple chunks?),
  along with some features tailored for React4xp:
  it gives the produced chunk a contenthash in the filename, and outputs a JSON file with the
  hashed name, for runtime reference. Content-hashed for caching and cache-busting.

  Which dependencies are inserted into the external library,
  depends on an `env.EXTERNALS` parameter (EXTERNALS can also be supplied through a
  JSON config file referenced with an `env.REACT4XP_CONFIG_FILE` - see for example
  [react4xp-buildconstants](https://www.npmjs.com/package/react4xp-buildconstants), although you can roll your own).
  This `EXTERNALS` parameter must be an object on the webpack
  externals format `{ "libraryname": "ReferenceInCode", ... }`,
  e.g. `{ "react-dom": "ReactDOM" }`. These libraries of course have to be supplied
  from the calling context (as such, they can be thought of
  as peer dependencies, but are obviously impossible to declare).
  `EXTERNALS` can also be a valid JSON-format string.

  In the same way, one more parameter is expected either directly through `env`
  or in the JSON file referenced through `env.REACT4XP_CONFIG_FILE`:
  - `BUILD_R4X`: mandatory string, full path to the
  React4xp build folder (where all react4xp-specific output files will be built)
*/

const path = require("path");
const fs = require("fs");

const Chunks2json = require("chunks-2-json-webpack-plugin");

// TODO: Find a good pattern to control output name for chunks,
// allowing for multi-chunks and still doing it in one pass (only one chunks.externals.json)
// TODO: Allowing build path (where BUILD_R4X today must be absolute)
// to instead be relative to project/calling context

// First autogenerates an externals temporary sourcefile,
// and then lets webpack have its filename in order to transpile it. Returns null if somethings off.
function generateTempES6SourceAndGetFilename(_externals, outputFileName) {
  if (
    typeof outputFileName !== "string" ||
    (outputFileName || "").trim() === ""
  ) {
    console.warn(`${__filename} - Skipping generation of the externals chunk: 
        \tThe outputFileName parameter must be a non-empty string: ${JSON.stringify(
          outputFileName,
          null,
          2
        )}`);
    return null;
  }

  let externals = _externals;

  if (typeof externals === "string") {
    externals = JSON.parse(_externals);
  }
  if (
    !externals ||
    typeof externals !== "object" ||
    Array.isArray(externals) ||
    Object.keys(externals) < 1
  ) {
    console.warn(`${__filename} - Skipping generation of the externals chunk: 
        \tThe externals parameter must be an object (or JSON-string object) with at least one entry: ${JSON.stringify(
          externals,
          null,
          2
        )}`);
    return null;
  }

  let externalsImports = "";
  let externalsExports = "";

  Object.keys(externals).forEach(key => {
    externalsImports += `import ${externals[key]} from '${key}';\n`;
  });

  /* Object.keys(externals).forEach( key => {
        externalsImports += `console.log('${externals[key]}: ' + ${externals[key]});\n`;
    }); // */

  Object.keys(externals).forEach(key => {
    externalsExports += `\twindow.${externals[key]} = ${externals[key]};\n`;
  });

  const externalsES6 = `// AUTO-GENERATED by ${__filename}\n\n${externalsImports}\n(function(window) {\n${externalsExports}} )(typeof window !== 'undefined' ? window : global);\n`;

  fs.writeFileSync(outputFileName, externalsES6);

  return outputFileName;
}

module.exports = (env = {}) => {
  let config = {};

  if (env.REACT4XP_CONFIG_FILE) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      config = require(path.join(process.cwd(), env.REACT4XP_CONFIG_FILE));
    } catch (e) {
      console.error(e);
    }
  }

  const BUILD_ENV = env.BUILD_ENV || config.BUILD_ENV;
  const BUILD_R4X = env.BUILD_R4X || config.BUILD_R4X;
  const EXTERNALS = env.EXTERNALS || config.EXTERNALS;
  const CHUNK_CONTENTHASH = env.CHUNK_CONTENTHASH || config.CHUNK_CONTENTHASH;
  const EXT_CHUNKS_FILENAME =
    env.EXTERNALS_CHUNKS_FILENAME || config.EXTERNALS_CHUNKS_FILENAME;

  const tempFileName = generateTempES6SourceAndGetFilename(
    EXTERNALS,
    path.join(__dirname, "_AUTOGENERATED_tmp_externals_.es6")
  );

  const entry = tempFileName ? { externals: tempFileName } : {};

  const plugins = tempFileName
    ? [
        new Chunks2json({
          outputDir: BUILD_R4X,
          filename: EXT_CHUNKS_FILENAME
        })
      ]
    : undefined;

  // Decides whether or not to hash filenames of common-component chunk files, and the length
  let chunkFileName;

  if (!CHUNK_CONTENTHASH) {
    chunkFileName = "[name].js";
  } else if (typeof CHUNK_CONTENTHASH === "string") {
    chunkFileName = CHUNK_CONTENTHASH;
  } else {
    chunkFileName = `[name].[contenthash:${parseInt(
      CHUNK_CONTENTHASH,
      10
    )}].js`;
  }

  return {
    mode: BUILD_ENV,

    entry,

    output: {
      path: BUILD_R4X, // <-- Sets the base url for plugins and other target dirs.
      filename: chunkFileName
    },

    resolve: {
      extensions: [".es6", ".js", ".jsx"]
    },
    module: {
      rules: [
        {
          test: /\.((jsx?)|(es6))$/,
          exclude: /node_modules/,
          loader: "babel-loader",
          query: {
            compact: true // (BUILD_ENV === 'production'),
          }
        }
      ]
    },

    plugins
  };
};
