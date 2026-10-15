'use strict';

const express = require('express');

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const TYPES = new Set(['Single', 'Double', 'Suite', 'Deluxe', 'Family']);
const SORT_FIELDS = new Set(['name', 'pricePerNight', 'capacity']);
const rooms = [];
let nextId = 1;

app.use(express.json({ strict: true }));

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateRoom(input, { partial = false, currentId = null } = {}) {
  if (!isPlainObject(input)) return 'Request body must be a JSON object';
  const allowed = ['name', 'location', 'type', 'pricePerNight', 'capacity', 'available', 'roomNumber'];
  const errors = [];

  for (const key of allowed) {
    if (!(key in input)) {
      if (!partial) errors.push(`${key} is required`);
      continue;
    }
    const value = input[key];
    if (key === 'name' || key === 'location' || key === 'roomNumber') {
      if (typeof value !== 'string') {
        errors.push(`${key} must be a string`);
        continue;
      }
      const trimmed = value.trim();
      const min = key === 'name' ? 3 : 2;
      const max = key === 'name' ? 40 : key === 'location' ? 40 : 20;
      if (trimmed.length < min || trimmed.length > max) errors.push(`${key} must be ${min} to ${max} characters`);
    } else if (key === 'type') {
      if (typeof value !== 'string' || !TYPES.has(value)) errors.push('type must be exactly Single, Double, Suite, Deluxe, or Family');
    } else if (key === 'pricePerNight') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000) errors.push('pricePerNight must be a number from 0 to 100000');
    } else if (key === 'capacity') {
      if (!Number.isInteger(value) || value < 1 || value > 10) errors.push('capacity must be a whole number from 1 to 10');
    } else if (key === 'available' && typeof value !== 'boolean') {
      errors.push('available must be a JSON boolean');
    }
  }

  // Unknown properties, including a client-supplied id, are ignored.
  if ('roomNumber' in input && typeof input.roomNumber === 'string') {
    const roomNumber = input.roomNumber.trim().toLowerCase();
    const duplicate = rooms.some(room => room.id !== currentId && room.roomNumber.toLowerCase() === roomNumber);
    if (duplicate) errors.push('roomNumber must be unique');
  }
  return errors.length ? errors.join('; ') : null;
}

function normalizeRoom(input) {
  const room = {};
  for (const key of ['name', 'location', 'roomNumber']) room[key] = input[key].trim();
  for (const key of ['type', 'pricePerNight', 'capacity', 'available']) room[key] = input[key];
  return room;
}

function numericQuery(query, key, { min = 0, max = Infinity, integer = false } = {}) {
  if (query[key] === undefined) return { value: undefined };
  const raw = query[key];
  if (raw.trim() === '') return { error: `${key} must be a valid ${integer ? 'integer' : 'number'}` };
  const value = Number(raw);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) {
    return { error: `${key} must be a valid ${integer ? 'integer' : 'number'}` };
  }
  return { value };
}

app.get('/api/rooms', (req, res) => {
  const pageResult = numericQuery(req.query, 'page', { min: 1, integer: true });
  const limitResult = numericQuery(req.query, 'limit', { min: 1, max: 50, integer: true });
  if (pageResult.error) return sendError(res, 400, pageResult.error);
  if (limitResult.error) return sendError(res, 400, limitResult.error);
  const minResult = numericQuery(req.query, 'minPricePerNight', { min: 0 });
  const maxResult = numericQuery(req.query, 'maxPricePerNight', { min: 0 });
  if (minResult.error) return sendError(res, 400, minResult.error);
  if (maxResult.error) return sendError(res, 400, maxResult.error);

  let result = [...rooms];
  if (req.query.search !== undefined && req.query.search !== '') {
    const term = req.query.search.toLowerCase();
    result = result.filter(room => room.name.toLowerCase().includes(term) || room.location.toLowerCase().includes(term));
  }
  if (req.query.type !== undefined) {
    if (!TYPES.has(req.query.type)) return sendError(res, 400, 'Invalid type');
    result = result.filter(room => room.type === req.query.type);
  }
  if (req.query.available !== undefined) {
    if (req.query.available !== 'true' && req.query.available !== 'false') return sendError(res, 400, 'available must be true or false');
    result = result.filter(room => room.available === (req.query.available === 'true'));
  }
  if (minResult.value !== undefined) result = result.filter(room => room.pricePerNight >= minResult.value);
  if (maxResult.value !== undefined) result = result.filter(room => room.pricePerNight <= maxResult.value);

  if (req.query.sort !== undefined) {
    if (!SORT_FIELDS.has(req.query.sort)) return sendError(res, 400, 'Invalid sort field');
    const order = req.query.order === undefined ? 'asc' : req.query.order;
    if (order !== 'asc' && order !== 'desc') return sendError(res, 400, 'order must be asc or desc');
    const direction = order === 'asc' ? 1 : -1;
    const field = req.query.sort;
    result.sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      const comparison = typeof av === 'string' ? av.localeCompare(bv, undefined, { sensitivity: 'base' }) : av - bv;
      return comparison * direction;
    });
  } else if (req.query.order !== undefined) {
    if (req.query.order !== 'asc' && req.query.order !== 'desc') return sendError(res, 400, 'order must be asc or desc');
    return sendError(res, 400, 'order requires sort');
  }

  const page = pageResult.value ?? 1;
  const limit = limitResult.value ?? 10;
  const total = result.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  return res.status(200).json({
    data: result.slice(start, start + limit),
    page,
    limit,
    total,
    totalPages
  });
});

app.post('/api/rooms', (req, res) => {
  const error = validateRoom(req.body);
  if (error) return sendError(res, 400, error);
  const room = { id: nextId++, ...normalizeRoom(req.body) };
  rooms.push(room);
  return res.status(201).json(room);
});

app.get('/api/rooms/:id', (req, res) => {
  const id = Number(req.params.id);
  const room = Number.isInteger(id) && id > 0 ? rooms.find(item => item.id === id) : undefined;
  if (!room) return sendError(res, 404, 'Room not found');
  return res.status(200).json(room);
});

app.put('/api/rooms/:id', (req, res) => {
  const id = Number(req.params.id);
  const index = Number.isInteger(id) && id > 0 ? rooms.findIndex(item => item.id === id) : -1;
  if (index < 0) return sendError(res, 404, 'Room not found');
  const error = validateRoom(req.body, { currentId: id });
  if (error) return sendError(res, 400, error);
  rooms[index] = { id, ...normalizeRoom(req.body) };
  return res.status(200).json(rooms[index]);
});

app.patch('/api/rooms/:id', (req, res) => {
  const id = Number(req.params.id);
  const room = Number.isInteger(id) && id > 0 ? rooms.find(item => item.id === id) : undefined;
  if (!room) return sendError(res, 404, 'Room not found');
  if (!isPlainObject(req.body)) return sendError(res, 400, 'Request body must be a JSON object');
  const allowed = ['name', 'location', 'type', 'pricePerNight', 'capacity', 'available', 'roomNumber'];
  const supplied = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  if (Object.keys(supplied).length === 0) return sendError(res, 400, 'PATCH must include at least one valid field');
  const merged = { ...room, ...supplied };
  const error = validateRoom(merged, { currentId: id });
  if (error) return sendError(res, 400, error);
  Object.assign(room, normalizeRoom(merged));
  return res.status(200).json(room);
});

app.delete('/api/rooms/:id', (req, res) => {
  const id = Number(req.params.id);
  const index = Number.isInteger(id) && id > 0 ? rooms.findIndex(item => item.id === id) : -1;
  if (index < 0) return sendError(res, 404, 'Room not found');
  rooms.splice(index, 1);
  return res.status(204).end();
});

app.use((req, res) => sendError(res, 404, 'Route not found'));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) return sendError(res, 400, 'Malformed JSON');
  return sendError(res, 400, 'Invalid request');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Hotel Rooms API listening on port ${PORT}`);
});
