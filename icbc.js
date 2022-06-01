const puppeteer = require('puppeteer');
var fs = require('fs');
var nodemailer = require('nodemailer');
const pool = require("./usersdb.js");

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const url = "https://onlinebusiness.icbc.com/webdeas-ui/login;type=driver"

async function checkForAppointment(page, phoneNumber, lastName, licenseNumber, mothersMaidenName, location, earliestDate, latestDate) {
  console.log(lastName, licenseNumber, mothersMaidenName, location, earliestDate, latestDate);
  await page.goto(url);
  // login info
  await page.type('#mat-input-0', lastName)
  await page.type('#mat-input-1', licenseNumber.toString())
  await page.type('#mat-input-2', mothersMaidenName)
  await page.click("#mat-checkbox-1 > label > span.mat-checkbox-inner-container")//"#mat-checkbox-1 > label > div")
  // submit login
  await page.click("body > app-root > app-login > mat-card > mat-card-content > form > div.form-control.action-buttons.mat-dialog-actions > button.mat-raised-button.mat-button-base.mat-accent")

  await page.waitForSelector('#mat-input-3')
  // TODO: choose variable location
  await page.type('#mat-input-3', location +',')
  await page.focus('#mat-input-3')
  await sleep(1000);
  // TODO: throw error if location not found
  await page.waitForSelector("div.cdk-overlay-pane > div > mat-option > span")
  await page.click("div.cdk-overlay-pane > div > mat-option > span")

  await page.click('#search-dialog > app-search-modal > div > div > form > div.search-action.mat-dialog-actions.ng-star-inserted > button')
    
  // select nearest service center - 2nd child - 5th for vernon testing
  await page.waitForSelector('#search-dialog > app-search-modal > div.dialog.ng-star-inserted > div > div:nth-child(2) > div.background-highlight')
  await page.click('#search-dialog > app-search-modal > div.dialog.ng-star-inserted > div > div:nth-child(2) > div.background-highlight')
  
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const client = require('twilio')(accountSid, authToken);

  var stream = fs.createWriteStream("log.txt", {flags: 'a'});
  var ts = Date.now()
  var today = new Date(ts)

  try {
      await page.waitForSelector('#mat-dialog-0 > app-eligible-tests > div > div.ng-star-inserted > div > div > span.no-appts-msg')
      console.log('no apptment found')
      stream.write(today.getDate() + ", " + today.getHours() + ":" + today.getMinutes() + ': no apptment found\n')
  } catch {
      console.log('apptment found')
      stream.write(today.getDate() + ", " + today.getHours() + ":" + today.getMinutes() + ': apptment found\n')
      

      // get number of div children of the parent appointment element
      const apptmentParentElement = await page.$("#mat-dialog-0 > app-eligible-tests > div > div.content-container.mat-dialog-content.ng-star-inserted > mat-button-toggle-group > div")
      const numChildren = await page.evaluate(element => element.childElementCount, apptmentParentElement)

      // get the date of the earliest available appointment 
      const earliestApptmentElement = await page.$("#mat-dialog-0 > app-eligible-tests > div > div.content-container.mat-dialog-content.ng-star-inserted > mat-button-toggle-group > div > div")
      let text = await page.evaluate(element => element.textContent, earliestApptmentElement)
      let textArray = text.trim().split(', ')
      const earliestApptment = new Date(textArray[1].slice(0, -2) + ", " + textArray[2])
  
      // get the date of the latest available appointment
      const latestApptmentElement = await page.$(`#mat-dialog-0 > app-eligible-tests > div > div.content-container.mat-dialog-content.ng-star-inserted > mat-button-toggle-group > div > span:nth-child(${numChildren}) > div`)
      var latestApptment;
      if (latestApptmentElement) {
        text = await page.evaluate(element => element.textContent, latestApptmentElement)
        textArray = text.trim().split(', ')
        latestApptment = new Date(textArray[1].slice(0, -2) + ", " + textArray[2])
      } else {
        latestApptment = earliestApptment
      }

      if ((!earliestDate || earliestDate <= latestApptment) && (!latestDate || earliestApptment <= latestDate)) {
        let datesString = "On ";
        datesString += earliestApptment.toDateString();
        if (earliestApptment != latestApptment) {
          datesString += " - " + latestApptment.toDateString();
        }

        console.log('apptment found in the date range', datesString)
        stream.write(today.getDate() + ", " + today.getHours() + ":" + today.getMinutes() + ': apptment found in the date range ' + datesString + '\n')
        client.messages
        .create({
            body: `Appointment found! ${datesString}\nBook here: ${url}`,
            from: '+2368370355',
            to: phoneNumber
        })
        .then(message => console.log(message.sid));
      } else {
        console.log('no apptment found in the date range')
        stream.write(today.getDate() + ", " + today.getHours() + ":" + today.getMinutes() + ': no apptment found in the date range\n')
      }
  }
}

async function run () {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();

  const sql = "SELECT * FROM users";
  pool.query(sql, async (err, res) => {
    if (err) {
      console.log(err.message)
    } else {
      for (row of res.rows) {
        await checkForAppointment(page, row.phonenumber, row.lastname, row.dlnumber, row.keyword, row.location, row.earliest, row.latest);
      }
      browser.close();
    }
  });

  var ts = Date.now();
  var today = new Date(ts);
  if (today.getHours() == 6 && today.getMinutes() <= 10) {
      var data = fs.readFileSync('log.txt', 'utf8')
      var transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: 'kategranstrom2000@gmail.com',
            pass: 'Revelstoke1066!'
          }
        });
        
        var mailOptions = {
          from: 'kategranstrom2000@gmail.com',
          to: 'kategranstrom2000@gmail.com',
          subject: 'ICBC bot summary',
          text: data
        };
        
        transporter.sendMail(mailOptions, function(error, info){
          if (error) {
            console.log(error);
          } else {
            console.log('Email sent: ' + info.response);
          }
        });
        fs.truncate('log.txt', 0, function(){console.log('done')})
  }
}

module.exports = { run }
