const express = require('express');
const MessagingResponse = require('twilio').twiml.MessagingResponse;
const nodeCron = require("node-cron");
const icbc = require("./icbc.js");
const pool = require("./usersdb.js");

const { json, urlencoded } = express;

const app = express();

app.use(json());
app.use(urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
})

app.get('/', function (req, res) {
        res.sendFile('./index.html', { root: __dirname });//<html><body><h1>ICBC Bot</h1></body></html>');
    });

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

                const sql = `UPDATE users set ${textArray[0].toLowerCase()} = $1 WHERE phonenumber = $2`;
                const sqlparams = [date, params.From]
                pool.query(sql, sqlparams, function (err, result) {
                        if (err) {      
                                twiml.message("Error:" + err.message);
                        } else if ( result.rowCount < 1 ) {
                                twiml.message("Error: not an active user, first register by texting:\n'Start lastname licensenumber keyword location'");
                        } else {
                                twiml.message(`Successfully updated ${textArray[0].toLowerCase()} date to check for appointments`);
                        }
                        console.log(twiml.toString(), text, params.From, result.rowCount)
                        res.end(twiml.toString());
                })

        } else if (text.startsWith('Update')) {
                const textArray = text.split(' ');

                if ( textArray.length != 5 ) {
                        twiml.message("Error: format of text should be:\n'Update lastname licensenumber keyword location'");
                        res.end(twiml.toString());
                        console.log(twiml.toString(), text);
                        return;
                }

                const sql = `UPDATE users set lastname = $1, dlnumber = $2, keyword = $3, location = $4 WHERE phonenumber = $5`;
                const sqlparams = [textArray[1], textArray[2], textArray[3], textArray[4], params.From]
                pool.query(sql, sqlparams, function (err, result) {
                        if (err) {      
                                twiml.message("Error:" + err.message);
                        } else if ( result.rowCount < 1 ) {
                                twiml.message("Error: not an active user. Register by texting:\n'Start lastname licensenumber keyword location'");
                        } else {
                                twiml.message("Successfully updated the info used by the ICBC bot");
                        }
                        console.log(twiml.toString(), text, params.From, result.rowCount);
                        res.end(twiml.toString());
                })

        } else if (text.startsWith('Finish')) {
                const sql = 'DELETE FROM users WHERE phonenumber = $1';
                const sqlparams = [params.From];
                pool.query(sql, sqlparams, function (err, result) {
                        if (err) {
                                twiml.message("Error:" + err.message);
                        } else {
                                twiml.message("Successfully stopped the ICBC bot");
                        }
                        console.log(twiml.toString(), sqlparams, result.rowCount);
                        res.end(twiml.toString());
                })

        } else if (text.startsWith('Start')) {
                const textArray = text.split(' ');
                if ( textArray.length != 5 ) {
                        twiml.message("To start the ICBC bot, send a text with the format:\n'Start lastname licensenumber keyword location'. Refer to https://icbc-bot.herokuapp.com/ for all possible commands.");
                        res.end(twiml.toString());
                        console.log(twiml.toString(), text);
                        return;
                }

                const sql = 'INSERT INTO users (phonenumber, lastname, dlnumber, keyword, location) VALUES ($1,$2,$3,$4,$5)';
                const sqlparams = [params.From, textArray[1], textArray[2], textArray[3], textArray[4]];
                pool.query(sql, sqlparams, function (err, result) {
                        if (err && err.code == 23505) { // unique constraint violation
                                twiml.message("Error: the ICBC bot is already runnning for this phone number. To change your information, text 'Update lastname licensenumber keyword location");
                        } else if (err) {
                                twiml.message("Error:" + err.message);
                        } else {
                                twiml.message("Successfully started the ICBC bot. You can specify the earliest and latest date to check for an appointment by texting 'Earliest mm/dd/yyy' or 'Latest mm/dd/yyyy'");
                        }
                        console.log(twiml.toString(), sqlparams);
                        res.end(twiml.toString());
                })
        } else if (text.startsWith('Check info')) {
                const sql = "SELECT * FROM users where phonenumber = $1";
                const sqlparams = [params.From];
                pool.query(sql, sqlparams, async (err, result) => {
                        if (err) {      
                                twiml.message("Error:" + err.message);
                        } else if ( result.rowCount < 1 ) {
                                twiml.message("Not an active user. Register by texting:\n'Start lastname licensenumber keyword location'");
                        } else {
                                const info = result.rows[0];
                                twiml.message("Info being used by the ICBC bot:\nlast name: " + info.lastname + "\nlicense number: " + info.dlnumber + "\nkeyword: " + info.keyword + "\nlocation: " + info.location + "\nearliest date: " + new Date(parseInt(info.earliest)).toDateString() +"\nlatest date: " + new Date(parseInt(info.latest)).toDateString());
                        }
                        console.log(twiml.toString(), text, params.From);
                        res.end(twiml.toString());
                });
        } else if (text.startsWith('Run now')) { 
                icbc.run();
        } else {
                twiml.message("Incorrect text format. Refer to https://icbc-bot.herokuapp.com/ for all possible commands.");
                console.log(twiml.toString(), text);
                res.end(twiml.toString());
        }
}

const job = nodeCron.schedule("0 * * * *", () => {
        icbc.run();
})
