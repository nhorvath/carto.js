var FormulaDataviewModel = require('../../../src/dataviews/formula-dataview-model.js');

describe('dataviews/formula-dataview-model', function () {
  beforeEach(function () {
    this.map = jasmine.createSpyObj('map', ['getViewBounds', 'bind', 'reload']);
    this.map.getViewBounds.and.returnValue([[1, 2], [3, 4]]);
    var windshaftMap = jasmine.createSpyObj('windshaftMap', ['bind']);
    this.model = new FormulaDataviewModel({
      operation: 'min'
    }, {
      map: this.map,
      windshaftMap: windshaftMap,
      layer: jasmine.createSpyObj('layer', ['get'])
    });
  });

  it('should reload map on operation change', function () {
    this.model.set('operation', 'avg');
    expect(this.map.reload).toHaveBeenCalled();
  });
});
