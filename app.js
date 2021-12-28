const express = require('express');
const MessagingResponse = require('twilio').twiml.MessagingResponse;
const nodeCron = require("node-cron");
const icbc = require("./icbc.js");
var db = require("./persondb.js");

const { json, urlencoded } = express;

const app = express();

app.use(json());
app.use(urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
})

app.post('/inbound', (req, res) => {
        handleParams(req.body, res);
})

function handleParams(params, res) {
        let text = params.Body;
        const twiml = new MessagingResponse();
        res.writeHead(200, {'Content-Type': 'text/xml'});

        if (text.startsWith('Earliest') || text.startsWith('Latest')) {
                const textArray = text.split(' ');
                const date = new Date(textArray[1]).getTime();

                if ( textArray.length != 2 || ! date ) {
                        twiml.message("Error: format of text should be:\n'Earliest mm/dd/yyyy'");
                        res.end(twiml.toString());
                        console.log(twiml.toString(), text);
                        return;
                }

                const sql = `UPDATE person set ${textArray[0].toLowerCase()} = ? WHERE phonenumber = ?`;
                const sqlparams = [date, params.From]
                db.run(sql, sqlparams, function (err) {
                        if (err) {      
                                twiml.message("Error:" + err.message);
                        } else if ( this.changes < 1 ) {
                                twiml.message("Error: not an active user, first register by texting:\n'Start lastname licensenumber keyword location'");
                        } else {
                                twiml.message(`Successfully updated ${textArray[0].toLowerCase()} date to check for appointments`);
                        }
                        console.log(twiml.toString(), text, params.From, this.changes)
                        res.end(twiml.toString());
                })

        } else if (text.startsWith('Update')) {
                const textArray = text.split(' ');

                if ( textArray.length != 4 ) {
                        twiml.message("Error: format of text should be:\n'Update lastname licensenumber keyword location'");
                        res.end(twiml.toString());
                        console.log(twiml.toString(), text);
                        return;
                }

                const sql = `UPDATE person set lastname = ?, dlnumber = ?, keyword = ?, location = ? WHERE phonenumber = ?`;
                const sqlparams = [textArray[1], textArray[2], textArray[3], textArray[4], params.From]
                db.run(sql, sqlparams, function (err) {
                        if (err) {      
                                twiml.message("Error:" + err.message);
                        } else if ( this.changes < 1 ) {
                                twiml.message("Error: not an active user. Register by texting:\n'Start lastname licensenumber keyword location'");
                        } else {
                                twiml.message("Successfully updated the info used by the ICBC bot");
                        }
                        console.log(twiml.toString(), text, params.From, this.changes);
                        res.end(twiml.toString());
                })

        } else if (text.startsWith('Finish')) {
                const sql = 'DELETE FROM person WHERE phonenumber = ?';
                const sqlparams = [params.From];
                db.run(sql, sqlparams, function (err) {
                        if (err) {
                                twiml.message("Error:" + err.message);
                        } else {
                                twiml.message("Successfully stopped the ICBC bot");
                        }
                        console.log(twiml.toString(), sqlparams, this.changes);
                        res.end(twiml.toString());
                })

        } else if (text.startsWith('Start')) {
                const textArray = text.split(' ');
                if ( textArray.length != 4 ) {
                        twiml.message("To start the ICBC bot, send a text with the format:\n'Start lastname licensenumber keyword location'");
                        res.end(twiml.toString());
                        console.log(twiml.toString(), text);
                        return;
                }

                const sql = 'INSERT INTO person (phonenumber, lastname, dlnumber, keyword, location) VALUES (?,?,?,?,?)';
                const sqlparams = [params.From, textArray[1], textArray[2], textArray[3], textArray[4]];
                db.run(sql, sqlparams, function (err) {
                        if (err && err.errno == 19) { // SQLITE_CONSTRAINT
                                twiml.message("Error: the ICBC bot is already runnning for this phone number. To change your information, text 'Update lastname licensenumber keyword location");
                        } else if (err) {
                                twiml.message("Error:" + err.message);
                        } else {
                                twiml.message("Successfully started the ICBC bot. You can specify the earliest and latest date to check for an appointment by texting 'Earliest mm/dd/yyy' or 'Latest mm/dd/yyyy'");
                        }
                        console.log(twiml.toString(), sqlparams, "id: " + this.lastID);
                        res.end(twiml.toString());
                })
        } else {
                twiml.message("Error: text format should be one of:\n'Start lastname licensenumber keyword location'\n'Finish'\n'Earliest mm/dd/yyyy'\n'Latest mm/dd/yyyy'\n'Update lastname licensenumber keyword location'");
                console.log(twiml.toString(), text);
                res.end(twiml.toString());
        }
}

const job = nodeCron.schedule("0 * * * *", () => {
        icbc.run();
})
