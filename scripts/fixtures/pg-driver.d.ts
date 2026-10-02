// The fixture deliberately loads the same installed pg file as its Edge bundle.
// Supply the published driver types for that file import, without an untyped
// wildcard for other JavaScript modules or a duplicate hand-written driver API.
declare module '*infra/portal-identity-candidate/node_modules/pg/lib/index.js' {
  import pg = require('pg');
  export = pg;
}
