const mongoose = require('mongoose');

const attractionSchema = new mongoose.Schema({
  name: String,
  image: String,
  description: String
});

const includedExcludedSchema = new mongoose.Schema({
  type: String,
  description: String
});

const itinerarySchema = new mongoose.Schema({
  title: String,
  time: String,
  description: String
});

const packageSchema = new mongoose.Schema({
  name: String,
  image: String,
  original_price: Number,
  discount_price: Number,
  message_description: String,
  duration: String,
  location: String,
  contact: String,
  description: String,
  top_attractions: [attractionSchema],
  included_excluded: [includedExcludedSchema],
  itinerary: [itinerarySchema],
  country: String,
  createdAt: Date,
  updatedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('Package', packageSchema);