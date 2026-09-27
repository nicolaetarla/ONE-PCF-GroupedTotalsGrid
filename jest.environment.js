/**
 * jsdom test environment built on Jest's bring-your-own-jsdom base class.
 *
 * jest-environment-jsdom pins an old jsdom whose dependency tree pulls in
 * deprecated packages. @jest/environment-jsdom-abstract is Jest's supported
 * way to run a newer jsdom; the devDependency version of `jsdom` is used here.
 *
 * The tests need a DOM for DOMParser/XMLSerializer (fetchXmlBuilder) and
 * window.localStorage (groupingPreference).
 */
const JSDOMEnvironment = require("@jest/environment-jsdom-abstract").default;
const jsdom = require("jsdom");

module.exports = class JsdomEnvironment extends JSDOMEnvironment {
  constructor(config, context) {
    super(config, context, jsdom);
  }
};
