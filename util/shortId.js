const DB = require('../db');
const { Postgres: dbPostgresConnection, Mongo } = DB;
let dbConnection = null;
const mongoose = require("mongoose");

const getDbConnection = async () => {
  if (dbConnection) return dbConnection;
  dbConnection = dbPostgresConnection.getConnection(global.Config.databases.ZsContent);
  return dbConnection;
}
let shortIDmodel = null;
const getMongoConnection = async () => {
  if (shortIDmodel) return;
  const mongooseConnection = Mongo.getConnection(global.Config.databases.ZsContent);
  shortIDmodel = mongooseConnection.model('short_id', new mongoose.Schema({ _id: String, value: Number }), 'short_id');
  return;

}

const getNewShortIdPostgres = async (model, type) => {
  getDbConnection();
  try {
    let updatedResult = await dbConnection.withTransaction(async tx => {
      const result = await tx.query(`UPDATE short_id SET value = value + 1 WHERE type='${type}' RETURNING type, value`);
      return result[0];
    }, {
      mode: new dbConnection.pgp.txMode.TransactionMode({
        tiLevel: dbConnection.pgp.txMode.isolationLevel.serializable
      })
    });
    return updatedResult.value;
  } catch (err) {
    throw err;
  }
};
const validateCollection = async () => {
  getMongoConnection();
  const data = await shortIDmodel.find({ _id: { $in: ['learning_plan', 'learning_unit', 'assessment_plan', "question"] }, value: { $exists: true } });
  if (data.length === 4) {
    return true;
  } else {
    throw new Error("record Not found in ShortId Table")
  }
};

const getNewShortId = async (model, type) => {
  getMongoConnection();
  const updatedResult = await shortIDmodel.findOneAndUpdate({ _id: type }, { $inc: { value: 1 } }, { new: true });
  return updatedResult.value;
};

module.exports = {
  getNewShortId,
  validateCollection
} 