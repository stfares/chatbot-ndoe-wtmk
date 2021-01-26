const express = require('express');
const multer = require('multer');
const cors = require('cors');
const app = express();
const fs = require('fs');
const Tesseract = require('tesseract.js');
const axios = require('axios');
const testingData = require('./testingData.json');

const dialogflow = require('@google-cloud/dialogflow');
const uuid = require('uuid');
const dotenv = require('dotenv');
dotenv.config();

//middlewares
app.set('view engine', 'ejs');
app.use(express.urlencoded({extended: true}));
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT | 5000;

//#region Image Upload code Start
var Storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, __dirname + '/images')
  },
  filename: (req, file, callback) => {
    callback(null, file.originalname)
  },
})

var upload = multer({
  storage: Storage,
}).single('image')

//route - rrot
app.get('/', (req, res) => {
  res.render('index')
})

// For ebs testing
app.post('/uploadejs', (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      console.log(err)
      return res.send('Something went wrong')
    }
    var image = fs.readFileSync(
      __dirname + '/images/' + req.file.originalname,
      {
        encoding: null,
      }
    )
    Tesseract.recognize(image)
      .progress(function (p) {
        console.log('progress', p)
      })
      .then(({text}) => {
        res.json(text)
      })
  })
})

// Extract questions from image
app.post('/upload', (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      console.log(err)
      return res.send('Something went wrong')
    }
    var image = fs.readFileSync(
      __dirname + '/images/' + req.file.originalname,
      {
        encoding: null,
      }
    )
    Tesseract.recognize(image)
      .progress(function (p) {
        console.log('progress', p)
      })
      .then(({text}) => {
        // Testing without api call
        // res.json(testingData)
        getQuestions(text)
        .then((questionJson) => {
          res.json(questionJson)
        });
      })
  })
})

var getQuestions = (content) => {
  // Ignore SSL issues
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const headers= {
    'Content-Type': 'text/plain',
    'Authorization': `Bearer ${process.env.AUTH_TOKEN}`
  }
  return axios.post(process.env.QUIZ_URL, content, {
    headers: headers
  })
  .then(function(response) {
    return response;
  })
  .catch(function(error) {
    console.log(error);
  });
}
//#endregion Image upload code end

// Get intent from google dialog flow
app.get('/intent', (req, res) => {
  const query = req.query.question;

  let privateKey = (process.env.NODE_ENV=="production") ? JSON.parse(process.env.DIALOGFLOW_PRIVATE_KEY) : process.env.DIALOGFLOW_PRIVATE_KEY
  let clientEmail = process.env.DIALOGFLOW_CLIENT_EMAIL
  let config = {
    credentials: {
      private_key: privateKey,
      client_email: clientEmail
    }
  }

  const projectId = 'course-sjvv'
  const sessionId = uuid.v4()
  const queries = [query]
  const languageCode = 'en'

  // Instantiates a session client
  const sessionClient = new dialogflow.SessionsClient(config)

  async function detectIntent(
    projectId,
    sessionId,
    query,
    contexts,
    languageCode
  ) {
    // The path to identify the agent that owns the created intent.
    const sessionPath = sessionClient.projectAgentSessionPath(
      projectId,
      sessionId
    )

    // The text query request.
    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: query,
          languageCode: languageCode,
        },
      },
    }

    if (contexts && contexts.length > 0) {
      request.queryParams = {
        contexts: contexts,
      }
    }

    const responses = await sessionClient.detectIntent(request)
    return responses[0]
  }

  async function executeQueries(projectId, sessionId, queries, languageCode) {
    // Keeping the context across queries let's us simulate an ongoing conversation with the bot
    let context
    let intentResponse
    for (const query of queries) {
      try {
        console.log(`Sending Query: ${query}`)
        intentResponse = await detectIntent(
          projectId,
          sessionId,
          query,
          context,
          languageCode
        )
        console.log('Detected intent')
        console.log(
          `Fulfillment Text: ${intentResponse.queryResult.fulfillmentText}`
        )
        const result = intentResponse.queryResult
        res.json({fulfillmentText: result.fulfillmentText, entity: result.parameters.fields.quiz && Object.keys(result.parameters.fields.quiz).length > 0 })
        // Use the context from this response for next queries
        context = intentResponse.queryResult.outputContexts
      } catch (error) {
        console.log(error)
      }
    }
  }
  executeQueries(projectId, sessionId, queries, languageCode)
})

app.listen(PORT, () => {
  console.log(`Server running on Port ${PORT}`)
})
