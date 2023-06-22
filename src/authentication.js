const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const net = require('net');
const axios = require('axios');
require('dotenv').config();
const favicon = require('serve-favicon');
const path = require('path');
const limiter = require('express-rate-limit');
// const {checkUser, requireAuth, createToken} = require('./src/authentication.js');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');


module.exports = {checkUser, requireAuth, createToken};