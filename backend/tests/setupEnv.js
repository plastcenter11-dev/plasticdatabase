// Runs before any test module is required (jest "setupFiles").
// Forces all DB connections made during tests to point at the isolated test database.
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'plasticdb_test';
