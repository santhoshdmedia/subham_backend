const Package = require('../models/package');
// Add new package
exports.createPackage = async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = [
      'name', 'image', 'original_price', 'discount_price', 
      'duration', 'location', 'description', 'country'
    ];
    
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Create new package
    const newPackage = new Package({
      name: req.body.name,
      image: req.body.image,
      original_price: req.body.original_price,
      discount_price: req.body.discount_price,
      message_description: req.body.message_description || '',
      duration: req.body.duration,
      location: req.body.location,
      contact: req.body.contact || '',
      description: req.body.description,
      top_attractions: req.body.top_attractions || [],
      included_excluded: req.body.included_excluded || [],
      itinerary: req.body.itinerary || [],
      country: req.body.country
    });

    // Save to database
    const savedPackage = await newPackage.save();

    res.status(201).json({
      success: true,
      message: 'Package created successfully',
      data: savedPackage
    });

  } catch (error) {
    console.error('Error creating package:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while creating package'
    });
  }
};

// Get individual package by ID
exports.getPackageById = async (req, res) => {
  try {
    const package = await Package.findById(req.params.id);
    
    if (!package) {
      return res.status(404).json({ 
        success: false,
        message: 'Package not found' 
      });
    }
    
    res.status(200).json({
      success: true,
      data: package
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// Get all packages (optional)
exports.getAllPackages = async (req, res) => {
  try {
    const packages = await Package.find();
    
    res.status(200).json({
      success: true,
      count: packages.length,
      data: packages
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};