var _ = require('underscore');
var Point = require('./point');
var Polyline = require('./polyline');
var Polygon = require('./polygon');
var MultiPoint = require('./multi-point');
var MultiPolygon = require('./multi-polygon');
var MultiPolyline = require('./multi-polyline');
var GeoJSONHelper = require('./geojson-helper');

var GEOJSON_TYPE_TO_CREATE_METHOD_NAME = {
  Point: 'createPointFromGeoJSON',
  LineString: 'createPolylineFromGeoJSON',
  Polygon: 'createPolygonFromGeoJSON',
  MultiPoint: 'createMultiPointFromGeoJSON',
  MultiPolygon: 'createMultiPolygonFromGeoJSON',
  MultiLineString: 'createMultiPolylineFromGeoJSON'
};

var GeometryFactory = function () {};

GeometryFactory.prototype.createPoint = function (attrs, options) {
  return new Point(attrs, options);
};

GeometryFactory.prototype.createPolyline = function (attrs, options) {
  return new Polyline(attrs, options);
};

GeometryFactory.prototype.createPolygon = function (attrs, options) {
  return new Polygon(attrs, options);
};

GeometryFactory.prototype.createMultiPoint = function (attrs, options) {
  return new MultiPoint(attrs, options);
};

GeometryFactory.prototype.createMultiPolygon = function (attrs, options) {
  return new MultiPolygon(attrs, options);
};

GeometryFactory.prototype.createMultiPolyline = function (attrs, options) {
  return new MultiPolyline(attrs, options);
};

GeometryFactory.prototype.createGeometryFromGeoJSON = function (geoJSON) {
  var geometryType = GeoJSONHelper.getGeometryType(geoJSON);
  var methodName = GEOJSON_TYPE_TO_CREATE_METHOD_NAME[geometryType];
  if (methodName) {
    return this[methodName](geoJSON);
  }

  throw new Error('Geometries of type ' + geometryType + ' are not supported yet');
};

GeometryFactory.prototype.createPointFromGeoJSON = function (geoJSON) {
  var lnglat = GeoJSONHelper.getGeometryCoordinates(geoJSON);
  var latlng = GeoJSONHelper.convertLngLatToLatLng(lnglat);
  return this.createPoint({
    latlng: latlng,
    geojson: geoJSON,
    editable: true
  });
};

GeometryFactory.prototype.createPolylineFromGeoJSON = function (geoJSON) {
  var lnglats = GeoJSONHelper.getGeometryCoordinates(geoJSON);
  var latlngs = GeoJSONHelper.convertLngLatsToLatLngs(lnglats);
  return this.createPolyline({
    geojson: geoJSON,
    editable: true
  }, { latlngs: latlngs });
};

GeometryFactory.prototype.createPolygonFromGeoJSON = function (geoJSON) {
  var lnglats = GeoJSONHelper.getGeometryCoordinates(geoJSON)[0];
  var latlngs = GeoJSONHelper.convertLngLatsToLatLngs(lnglats);
  // Remove the last latlng, which is duplicated
  latlngs = latlngs.slice(0, -1);
  return this.createPolygon({
    geojson: geoJSON,
    editable: true
  }, { latlngs: latlngs });
};

GeometryFactory.prototype.createMultiPointFromGeoJSON = function (geoJSON) {
  var lnglats = GeoJSONHelper.getGeometryCoordinates(geoJSON);
  var latlngs = GeoJSONHelper.convertLngLatsToLatLngs(lnglats);
  return this.createMultiPoint({
    geojson: geoJSON,
    editable: true
  }, {
    latlngs: latlngs
  });
};

GeometryFactory.prototype.createMultiPolygonFromGeoJSON = function (geoJSON) {
  var lnglats = GeoJSONHelper.getGeometryCoordinates(geoJSON);
  var latlngs = _.map(lnglats, function (lnglats) {
    // Remove the last latlng, which is duplicated
    latlngs = GeoJSONHelper.convertLngLatsToLatLngs(lnglats[0]);
    latlngs = latlngs.slice(0, -1);
    return latlngs;
  }, this);
  return this.createMultiPolygon({
    geojson: geoJSON,
    editable: true
  }, {
    latlngs: latlngs
  });
};

GeometryFactory.prototype.createMultiPolylineFromGeoJSON = function (geoJSON) {
  var lnglats = GeoJSONHelper.getGeometryCoordinates(geoJSON);
  var latlngs = _.map(lnglats, function (lnglats) {
    return GeoJSONHelper.convertLngLatsToLatLngs(lnglats);
  }, this);
  return this.createMultiPolyline({
    geojson: geoJSON,
    editable: true
  }, {
    latlngs: latlngs
  });
};

module.exports = GeometryFactory;
