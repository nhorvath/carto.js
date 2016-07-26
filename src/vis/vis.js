var _ = require('underscore');
var Backbone = require('backbone');
var util = require('cdb.core.util');
var Map = require('../geo/map');
var DataviewsFactory = require('../dataviews/dataviews-factory');
var WindshaftConfig = require('../windshaft/config');
var WindshaftClient = require('../windshaft/client');
var WindshaftNamedMap = require('../windshaft/named-map');
var WindshaftAnonymousMap = require('../windshaft/anonymous-map');
var AnalysisFactory = require('../analysis/analysis-factory');
var CartoDBLayerGroupNamedMap = require('../geo/cartodb-layer-group-named-map');
var CartoDBLayerGroupAnonymousMap = require('../geo/cartodb-layer-group-anonymous-map');
var ModelUpdater = require('./model-updater');
var LayersCollection = require('../geo/map/layers');
var AnalysisPoller = require('../analysis/analysis-poller');
var Layers = require('./vis/layers');

var STATE_INIT = 'init'; // vis hasn't been sent to Windshaft
var STATE_OK = 'ok'; // vis has been sent to Windshaft and everything is ok
var STATE_ERROR = 'error'; // vis has been sent to Windshaft and there were some issues

var VisModel = Backbone.Model.extend({
  defaults: {
    loading: false,
    https: false,
    showLegends: false,
    showEmptyInfowindowFields: false,
    state: STATE_INIT
  },

  initialize: function () {
    this._loadingObjects = [];
    this._analysisPoller = new AnalysisPoller();
    this._layersCollection = new LayersCollection();
    this._analysisCollection = new Backbone.Collection();
    this._dataviewsCollection = new Backbone.Collection();

    this.overlaysCollection = new Backbone.Collection();
    this._instantiateMapWasCalled = false;
  },

  done: function (callback) {
    this._doneCallback = callback;
    return this;
  },

  setOk: function () {
    // Invoke this._doneCallback if present, the first time
    // the vis is instantiated correctly
    if (this.get('state') === STATE_INIT) {
      this._doneCallback && this._doneCallback(this);
    }

    this.set('state', STATE_OK);
    this.unset('error');
  },

  error: function (callback) {
    this._errorCallback = callback;
    return this;
  },

  setError: function (error) {
    // Invoke this._errorCallback if present, the first time
    // the vis is instantiated and the're some errors
    if (this.get('state') === STATE_INIT) {
      this._errorCallback && this._errorCallback(error);
    }

    this.set({
      state: STATE_ERROR,
      error: error
    });
  },

  /**
   * @return Array of {LayerModel}
   */
  getLayers: function () {
    return _.clone(this.map.layers.models);
  },

  /**
   * @param {Integer} index Layer index (including base layer if present)
   * @return {LayerModel}
   */
  getLayer: function (index) {
    return this.map.layers.at(index);
  },

  load: function (vizjson) {
    // Create the WindhaftClient
    var endpoint;
    var WindshaftMapClass;
    var CartoDBLayerGroupClass;

    var datasource = vizjson.datasource;
    var isNamedMap = !!datasource.template_name;

    if (isNamedMap) {
      endpoint = [ WindshaftConfig.MAPS_API_BASE_URL, 'named', datasource.template_name ].join('/');
      CartoDBLayerGroupClass = CartoDBLayerGroupNamedMap;
      WindshaftMapClass = WindshaftNamedMap;
    } else {
      endpoint = WindshaftConfig.MAPS_API_BASE_URL;
      CartoDBLayerGroupClass = CartoDBLayerGroupAnonymousMap;
      WindshaftMapClass = WindshaftAnonymousMap;
    }

    this.layerGroupModel = new CartoDBLayerGroupClass({
      apiKey: this.get('apiKey')
    }, {
      layersCollection: this._layersCollection
    });

    var windshaftClient = new WindshaftClient({
      endpoint: endpoint,
      urlTemplate: datasource.maps_api_template,
      userName: datasource.user_name,
      forceCors: datasource.force_cors || true
    });

    var modelUpdater = new ModelUpdater({
      visModel: this,
      layerGroupModel: this.layerGroupModel,
      dataviewsCollection: this._dataviewsCollection,
      layersCollection: this._layersCollection,
      analysisCollection: this._analysisCollection
    });

    // Create the WindshaftMap
    this._windshaftMap = new WindshaftMapClass({
      apiKey: this.get('apiKey'),
      authToken: this.get('authToken'),
      statTag: datasource.stat_tag
    }, {
      client: windshaftClient,
      modelUpdater: modelUpdater,
      dataviewsCollection: this._dataviewsCollection,
      layersCollection: this._layersCollection,
      analysisCollection: this._analysisCollection
    });

    // Create the Map
    var allowDragging = util.isMobileDevice() || vizjson.hasZoomOverlay() || vizjson.scrollwheel;

    this.map = new Map({
      title: vizjson.title,
      description: vizjson.description,
      bounds: vizjson.bounds,
      center: vizjson.center,
      zoom: vizjson.zoom,
      scrollwheel: !!this.scrollwheel,
      drag: allowDragging,
      provider: vizjson.map_provider,
      vector: vizjson.vector
    }, {
      layersCollection: this._layersCollection,
      windshaftMap: this._windshaftMap,
      dataviewsCollection: this._dataviewsCollection
    });

    // TODO: Temporary hack so that we can forward map.reload to vis.reload
    this.map.vis = this;

    // Reset the collection of overlays
    this.overlaysCollection.reset(vizjson.overlays);

    // Create the public Dataview Factory
    this.dataviews = new DataviewsFactory({
      apiKey: this.get('apiKey'),
      authToken: this.get('authToken')
    }, {
      map: this.map,
      vis: this,
      dataviewsCollection: this._dataviewsCollection,
      analysisCollection: this._analysisCollection
    });

    // Create the public Analysis Factory
    this.analysis = new AnalysisFactory({
      apiKey: this.get('apiKey'),
      authToken: this.get('authToken'),
      analysisCollection: this._analysisCollection,
      vis: this
    });

    this._windshaftMap.bind('instanceRequested', this._onMapInstanceRequested, this);
    this._windshaftMap.bind('instanceCreated', this._onMapInstanceCreated, this);

    // Lastly: reset the layer models on the map
    var layerModels = this._newLayerModels(vizjson, this.map);
    this.map.layers.reset(layerModels);

    // "Load" existing analyses from the viz.json. This will generate
    // the analyses graphs and index analysis nodes in the
    // collection of analysis
    if (vizjson.analyses) {
      _.each(vizjson.analyses, function (analysis) {
        this.analysis.analyse(analysis);
      }, this);
    }
    // Global variable for easier console debugging / testing
    window.vis = this;

    _.defer(function () {
      this.trigger('load', this);
    }.bind(this));
  },

  _onMapInstanceRequested: function () {
    this.trigger('reload');
  },

  _onMapInstanceCreated: function () {
    this._analysisPoller.reset();
    this._analysisCollection.each(function (analysisModel) {
      analysisModel.unbind('change:status', this._onAnalysisStatusChanged, this);
      if (analysisModel.url() && !analysisModel.isDone()) {
        this._analysisPoller.poll(analysisModel);
        this.trackLoadingObject(analysisModel);
        analysisModel.bind('change:status', this._onAnalysisStatusChanged, this);
      }
    }, this);
  },

  _onAnalysisStatusChanged: function (analysisModel) {
    if (analysisModel.isDone()) {
      this.untrackLoadingObject(analysisModel);
      if (this._isAnalysisSourceOfLayerOrDataview(analysisModel)) {
        this.reload();
      }
    }
  },

  _isAnalysisSourceOfLayerOrDataview: function (analysisModel) {
    var isAnalysisLinkedToLayer = this._layersCollection.any(function (layerModel) {
      return layerModel.get('source') === analysisModel.get('id');
    });
    var isAnalysisLinkedToDataview = this._dataviewsCollection.any(function (dataviewModel) {
      var sourceId = dataviewModel.getSourceId();
      return analysisModel.get('id') === sourceId;
    });
    return isAnalysisLinkedToLayer || isAnalysisLinkedToDataview;
  },

  trackLoadingObject: function (object) {
    if (this._loadingObjects.indexOf(object) === -1) {
      this._loadingObjects.push(object);
    }
    this.set('loading', true);
  },

  untrackLoadingObject: function (object) {
    var index = this._loadingObjects.indexOf(object);
    if (index >= 0) {
      this._loadingObjects.splice(index, 1);
      if (this._loadingObjects.length === 0) {
        this.set('loading', false);
      }
    }
  },

  /**
   * Force a map instantiation.
   * Only expected to be called once if {skipMapInstantiation} flag is set to true when vis is created.
   */
  instantiateMap: function (options) {
    options = options || {};
    if (!this._instantiateMapWasCalled) {
      this._instantiateMapWasCalled = true;
      var successCallback = options.success;
      options.success = function () {
        this._initBindsAfterFirstMapInstantiation();
        successCallback && successCallback();
      }.bind(this);
      this.reload(options);
    }
  },

  reload: function (options) {
    options = options || {};
    options = _.pick(options, 'sourceId', 'forceFetch', 'success', 'error');
    if (this._instantiateMapWasCalled) {
      this._windshaftMap.createInstance(options);
    }
  },

  _initBindsAfterFirstMapInstantiation: function () {
    this._layersCollection.bind('reset', this._onLayersResetted, this);
    this._layersCollection.bind('add', this._onLayerAdded, this);
    this._layersCollection.bind('remove', this._onLayerRemoved, this);

    if (this._dataviewsCollection) {
      // When new dataviews are defined, a new instance of the map needs to be created
      this._dataviewsCollection.on('add reset remove', _.debounce(this.invalidateSize, 10), this);
      this.listenTo(this._dataviewsCollection, 'add', _.debounce(this._onDataviewAdded.bind(this), 10));
    }
  },

  _onLayersResetted: function () {
    this.reload();
  },

  _onLayerAdded: function (layerModel) {
    this.reload({
      sourceId: layerModel.get('id')
    });
  },

  _onLayerRemoved: function (layerModel) {
    this.reload({
      sourceId: layerModel.get('id')
    });
  },

  _onDataviewAdded: function (layerModel) {
    this.reload();
  },

  invalidateSize: function () {
    this.trigger('invalidateSize');
  },

  centerMapToOrigin: function () {
    this.invalidateSize();
    this.map.reCenter();
  },

  _newLayerModels: function (vizjson, map) {
    var layerModels = [];
    var layersOptions = {
      https: this.get('https'),
      map: map
    };
    _.each(vizjson.layers, function (layerData) {
      if (layerData.type === 'layergroup' || layerData.type === 'namedmap') {
        var layersData;
        if (layerData.type === 'layergroup') {
          layersData = layerData.options.layer_definition.layers;
        } else {
          layersData = layerData.options.named_map.layers;
        }
        _.each(layersData, function (layerData) {
          layerModels.push(Layers.create('CartoDB', layerData, layersOptions));
        });
      } else {
        layerModels.push(Layers.create(layerData.type, layerData, layersOptions));
      }
    });

    return layerModels;
  }
});

module.exports = VisModel;
