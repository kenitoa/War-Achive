require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const dataRoutes = require('./routes/dataRoutes');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./middleware/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & parsing middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));
app.use(logger);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
