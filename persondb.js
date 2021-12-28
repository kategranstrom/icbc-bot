const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database('person.db', (err) => {
        if (err) {
                console.log(err.messae);
        } else {
                console.log('Connected to the person database');
                db.run(`CREATE TABLE person (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        phonenumber INTEGER UNIQUE,
                        lastname TEXT,
                        dlnumber INTEGER,
                        keyword TEXT,
                        location TEXT,
                        earliest INTEGER,
                        latest INTEGER
                )`, (err) => {
                        if (err) {
                                // Table already created
                        }
                })
        }
});

module.exports = db