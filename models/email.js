const mongoose = require('mongoose');

const inquirySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['new', 'in_progress', 'resolved'],
    default: 'new'
  },
  package: {
    type: String,
  }
});

// Add text index for search functionality
inquirySchema.index({ name: 'text', email: 'text', message: 'text' });

module.exports = mongoose.model('Inquiry', inquirySchema);