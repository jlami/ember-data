import setupStore from 'dummy/tests/helpers/store';
import Ember from 'ember';

import {module, test} from 'qunit';

import DS from 'ember-data';

let store, env, manager;

const { run } = Ember;

const Person = DS.Model.extend({
  name: DS.attr('string'),
  cars: DS.hasMany('car', { async: false })
});

const Car = DS.Model.extend({
  make: DS.attr('string'),
  model: DS.attr('string'),
  person: DS.belongsTo('person', { async: false })
});

module('integration/record_array_manager', {
  beforeEach() {
    env = setupStore({
      adapter: DS.RESTAdapter.extend()
    });
    store = env.store;

    manager = store.recordArrayManager;

    env.registry.register('model:car', Car);
    env.registry.register('model:person', Person);
  }
});

function tap(obj, methodName, callback) {
  var old = obj[methodName];

  var summary = { called: [] };

  obj[methodName] = function() {
    var result = old.apply(obj, arguments);
    if (callback) {
      callback.apply(obj, arguments);
    }
    summary.called.push(arguments);
    return result;
  };

  return summary;
}

test('destroying the store correctly cleans everything up', function(assert) {
  let query = { };
  let person;

  run(() => {
    store.push({
      data: {
        type: 'car',
        id: '1',
        attributes: {
          make: 'BMC',
          model: 'Mini Cooper'
        },
        relationships: {
          person: {
            data: { type: 'person', id: '1' }
          }
        }
      }
    });
  });

  run(() => {
    store.push({
      data: {
        type: 'person',
        id: '1',
        attributes: {
          name: 'Tom Dale'
        },
        relationships: {
          cars: {
            data: [
              { type: 'car', id: '1' }
            ]
          }
        }
      }
    });
    person = store.peekRecord('person', 1);
  });

  let filterd = manager.createFilteredRecordArray('person', () => true);
  let filterd2 = manager.createFilteredRecordArray('person', () => true);
  let all = store.peekAll('person');
  let adapterPopulated = manager.createAdapterPopulatedRecordArray('person', query);

  let filterdSummary = tap(filterd, 'willDestroy');
  let filterd2Summary = tap(filterd2, 'willDestroy');
  let allSummary = tap(all, 'willDestroy');
  let adapterPopulatedSummary = tap(adapterPopulated, 'willDestroy');

  let internalPersonModel = person._internalModel;

  assert.equal(filterdSummary.called.length, 0);
  assert.equal(filterd2Summary.called.length, 0);
  assert.equal(allSummary.called.length, 0);
  assert.equal(adapterPopulatedSummary.called.length, 0);

  assert.equal(internalPersonModel._recordArrays.size, 3, 'expected the person to be a member of 3 recordArrays');

  Ember.run(filterd2, filterd2.destroy);

  assert.equal(internalPersonModel._recordArrays.size, 2, 'expected the person to be a member of 2 recordArrays');
  assert.equal(filterd2Summary.called.length, 1);

  assert.equal(manager.liveRecordArrays.has('person'), true);

  Ember.run(all, all.destroy);

  assert.equal(internalPersonModel._recordArrays.size, 1, 'expected the person to be a member of 1 recordArrays');
  assert.equal(allSummary.called.length, 1);
  assert.equal(manager.liveRecordArrays.has('person'), false);

  Ember.run(manager, manager.destroy);

  assert.equal(internalPersonModel._recordArrays.size, 0, 'expected the person to be a member of no recordArrays');
  assert.equal(filterdSummary.called.length, 1);
  assert.equal(filterd2Summary.called.length, 1);
  assert.equal(allSummary.called.length, 1);
  assert.equal(adapterPopulatedSummary.called.length, 1);
});

test('Should not filter a store.peekAll() array when a record property is changed', function(assert) {
  let updateLiveRecordArray = tap(store.recordArrayManager, 'updateLiveRecordArray');
  let updateFilterRecordArray = tap(store.recordArrayManager, 'updateFilterRecordArray');

  let cars = store.peekAll('car');

  assert.deepEqual(cars.toArray(), []);

  let car = run(() => {
    store.push({
      data: {
        type: 'car',
        id: '1',
        attributes: {
          make: 'BMC',
          model: 'Mini Cooper'
        },
        relationships: {
          person: {
            data: { type: 'person', id: '1' }
          }
        }
      }
    });

    return store.peekRecord('car', 1);
  });

  assert.deepEqual(cars.toArray(), [car]);

  assert.equal(updateLiveRecordArray.called.length, 1);
  assert.equal(updateFilterRecordArray.called.length, 0);

  run(() => car.set('model', 'Mini'));

  assert.deepEqual(cars.toArray(), [car]);

  // TODO: differentiate between change + add/remove so we can skip non-filtered record arrays
  assert.equal(updateLiveRecordArray.called.length, 2);
  assert.equal(updateFilterRecordArray.called.length, 0);
});

test('batch liveRecordArray changes', function(assert) {
  let cars = store.peekAll('car');
  let arrayContentWillChangeCount = 0;

  cars.arrayContentWillChange = function(startIndex, removeCount, addedCount) {
    arrayContentWillChangeCount++;
    assert.equal(startIndex, 0, 'expected 0 startIndex');
    assert.equal(removeCount, 0, 'expected 0 removed');
    assert.equal(addedCount, 2, 'expected 2 added');
  };

  assert.deepEqual(cars.toArray(), []);
  assert.equal(arrayContentWillChangeCount, 0, 'expected NO arrayChangeEvents yet');

  run(() => {
    store.push({
      data: [
        {
          type: 'car',
          id: '1',
          attributes: {
            make: 'BMC',
            model: 'Mini Cooper'
          }
        },
        {
          type: 'car',
          id: '2',
          attributes: {
            make: 'Jeep',
            model: 'Wrangler'
          }
        }
      ]
    });
  });

  assert.equal(arrayContentWillChangeCount, 1, 'expected ONE array change event');

  assert.deepEqual(cars.toArray(), [
    store.peekRecord('car', 1),
    store.peekRecord('car', 2)
  ]);

  run(() => store.peekRecord('car', 1).set('model', 'Mini'));

  assert.equal(arrayContentWillChangeCount, 1, 'expected ONE array change event');

  cars.arrayContentWillChange = function(startIndex, removeCount, addedCount) {
    arrayContentWillChangeCount++;
    assert.equal(startIndex, 2, 'expected a start index of TWO');
    assert.equal(removeCount, 0, 'expected no removes');
    assert.equal(addedCount, 1, 'expected ONE add');
  };

  arrayContentWillChangeCount = 0;

  run(() => {
    store.push({
      data: [
        {
          type: 'car',
          id: 2, // this ID is already present, array wont need to change
          attributes: {
            make: 'Tesla',
            model: 'S'
          }
        }
      ]
    });
  });

  assert.equal(arrayContentWillChangeCount, 0, 'expected NO array change events');

  arrayContentWillChangeCount = 0;

  cars.arrayContentWillChange = function(startIndex, removeCount, addedCount) {
    arrayContentWillChangeCount++;
    assert.equal(startIndex, 2, 'expected a start index of TWO');
    assert.equal(removeCount, 0, 'expected no removes');
    assert.equal(addedCount, 2, 'expected TWO adds');
  };

  run(() => {
    store.push({
      data: [
        {
          type: 'car',
          id: 3,
          attributes: {
            make: 'Tesla',
            model: 'S'
          }
        },
        {
          type: 'car',
          id: 4,
          attributes: {
            make: 'Tesla',
            model: 'S'
          }
        }
      ]
    });
  });

  assert.equal(arrayContentWillChangeCount, 1, 'expected ONE array change event');
});

test('#GH-4041 store#query AdapterPopulatedRecordArrays are removed from their managers instead of retained when #destroy is called', function(assert) {
  run(() => {
    store.push({
      data: {
        type: 'car',
        id: '1',
        attributes: {
          make: 'Honda',
          model: 'fit'
        }
      }
    });
  });

  const query = {};

  let adapterPopulated = manager.createAdapterPopulatedRecordArray('car', query);

  run(() => adapterPopulated.destroy());

  assert.equal(manager._adapterPopulatedRecordArrays.length, 0);
});
