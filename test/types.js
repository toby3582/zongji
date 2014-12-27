var settings = require('./settings/mysql');
var connector =  require('./helpers/connector');
var querySequence = require('./helpers/querySequence');
var expectEvents = require('./helpers/expectEvents');

var conn = process.testZongJi || {};

module.exports = {
  setUp: function(done){
    if(!conn.db) process.testZongJi = connector.call(conn, settings, done);
    else done();
  },
  tearDown: function(done){
    conn.eventLog.splice(0, conn.eventLog.length);
    conn.errorLog.splice(0, conn.errorLog.length);
    done();
  }
};

// @param {string} name - unique identifier of this test [a-zA-Z0-9]
// @param {[string]} fields - MySQL field description e.g. `BIGINT NULL`
// @param {[[any]]} testRows - 2D array of rows and fields to insert and test
// @param {func} customTest - optional, instead of exact row check
var defineTypeTest = function(name, fields, testRows, customTest){
  module.exports[name] = function(test){
    var testTable = 'type_' + name;
    var fieldText = fields.map(function(field, index){
      return 'col' + index + ' ' + field;
    }).join(', ');
    var insertColumns = fields.map(function(field, index){
      return 'col' + index;
    }).join(', ');
    var insertRows = testRows.map(function(row){
      return '(' + row.map(function(field){
        return field === null ? 'null' : field;
      }).join(', ') + ')';
    }).join(', ');

    querySequence(conn.db, [
      'DROP TABLE IF EXISTS ' + conn.escId(testTable),
      'CREATE TABLE ' + conn.escId(testTable) + ' (' + fieldText + ')',
      'INSERT INTO ' + conn.escId(testTable) +
        ' (' + insertColumns + ') VALUES ' + insertRows,
      'SELECT * FROM ' + conn.escId(testTable)
    ], function(results){
      var selectResult = results[results.length - 1];
      var expectedWrite = {
        _type: 'WriteRows',
        _checkTableMap: function(test, event){
          var tableDetails = event.tableMap[event.tableId]; 
          test.strictEqual(tableDetails.parentSchema, settings.database);
          test.strictEqual(tableDetails.tableName, testTable);
        }
      };

      if(customTest){
        expectedWrite._custom = customTest.bind(selectResult);
      }else{
        expectedWrite.rows = selectResult.map(function(row){
          for(var field in row){
            if(row.hasOwnProperty(field) && row[field] instanceof Buffer)
              row[field] = row[field].toString();
          }
          return row;
        });
      };

      expectEvents(test, conn.eventLog, [
        {
          _type: 'TableMap',
          tableName: testTable,
          schemaName: settings.database
        },
        expectedWrite
      ]);

      test.equal(conn.errorLog.length, 0);
      conn.errorLog.length &&
        console.log('Type Test Error: ', name, conn.errorLog);

      test.done();
    });
  }
};

// Begin test case definitions

defineTypeTest('set', [
  'SET(' +
  '"a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", ' +
  '"n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z")'
], [
  ['"a,d"'], ['"d,a,b"'], ['"a,d,i,z"'], ['"a,j,d"'], ['"d,a,p"'],
  ['""'], [null]
]);

defineTypeTest('int_signed', [
  'INT SIGNED NULL',
  'BIGINT SIGNED NULL',
  'TINYINT SIGNED NULL',
  'SMALLINT SIGNED NULL',
  'MEDIUMINT SIGNED NULL'
], [
  [2147483647, 9007199254740992, 127, 32767, 8388607],
  [-2147483648, -9007199254740992, -128, -32768, -8388608],
  [-2147483645, -9007199254740990, -126, -32766, -8388606],
  [-1, -1, -1, -1, -1],
  [123456, 100, 96, 300, 1000],
  [-123456, -100, -96, -300, -1000]
]);

defineTypeTest('int_unsigned', [
  'INT UNSIGNED NULL',
  'BIGINT UNSIGNED NULL',
  'TINYINT UNSIGNED NULL',
  'SMALLINT UNSIGNED NULL',
  'MEDIUMINT UNSIGNED NULL'
], [
  [4294967295, 9007199254740992, 255, 65535, 16777215],
  [1, 1, 1, 1, 1],
  [1, 8589934591, 1, 1, 1],
  [123456, 100, 96, 300, 1000]
]);

defineTypeTest('double', [
  'DOUBLE NULL'
], [
  [1.0], [-1.0], [123.456], [-13.47], [0.00005], [-0.00005],
  [8589934592.123], [-8589934592.123], [null]
]);

defineTypeTest('float', [
  'FLOAT NULL'
], [
  [1.0], [-1.0], [123.456], [-13.47], [3999.12]
], function(test, event){
  // Ensure sum of differences is very low
  var diff = event.rows.reduce(function(prev, cur, index){
    return prev + Math.abs(cur.col0 - this[index].col0);
  }.bind(this), 0);
  test.ok(diff < 0.001);
});

defineTypeTest('decimal', [
  'DECIMAL(30, 10) NULL'
], [
  [1.0], [-1.0], [123.456], [-13.47],
  [123456789.123], [-123456789.123], [null]
]);

defineTypeTest('blob', [
  'BLOB NULL',
  'TINYBLOB NULL',
  'MEDIUMBLOB NULL',
  'LONGBLOB NULL'
], [
  ['"something here"', '"tiny"', '"medium"', '"long"'],
  ['"nothing there"', '"small"', '"average"', '"huge"'],
  [null, null, null, null]
]);

// defineTypeTest('temporal', [
//   'DATE NULL',
//   'TIME NULL',
//   'DATETIME NULL',
//   'TIMESTAMP NULL',
//   'YEAR NULL'
// ], [
//   ['"1000-01-01"', '"-838:59:59"', '"1000-01-01 00:00:00"',
//     '"1970-01-01 00:00:01"', 1901],
//   ['"9999-12-31"', '"838:59:59"', '"9999-12-31 23:59:59"',
//     '"2038-01-19 03:14:07"', 2155],
//   ['"2014-12-27"', '"01:07:08"', '"2014-12-27 01:07:08"',
//     '"2014-12-27 01:07:08"', 2014]
// ], function(test, event){
//   console.log(this);
// });


