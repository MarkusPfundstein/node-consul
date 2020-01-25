const express = require('express')
const Router = require('express-promise-router')
const fetch = require('node-fetch')

const registerAsConsulService = async (serviceName, id, port) => {
  const payload = {
    ID: serviceName + '.' + id,
    Name: serviceName,
    Tags: ["test-service", "v1.0.0"],
    Port: port,
    EnableTagOverride: false,
    Check: {
      Http: 'http://localhost:' + port + '/health',
      Method: 'GET',
      Interval: '5s',
      Timeout: '1s',
      DeregisterCriticalServiceAfter: "5s",
    }
  }

  console.log(payload)

  try {
    const ops = {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload, null, 2)
    }
      
    await fetch('http://127.0.0.1:8500/v1/agent/service/register?replace-existing-checks=true', ops)
    return true
  } catch (e) {
    console.error(e)
    return false
  }
}

const init = async () => {

  const serviceName = 'consul-echo-service'
  const id = Math.round(Math.random() * 100)

  const router = new Router()

  router.get('/echo/:name', async (req, res) => {
    console.log('echo')
    res.send(req.params.name)
  })

  router.get('/health', async (req, res) => {
    console.log('consul health check')
    res.sendStatus(200)
  })

  const app = express()
  app.use('/', router)

  const server = require('http').createServer(app)

  const listener = server.listen(async () => {
    console.log('server running at', listener.address().port)
    const done = await registerAsConsulService(serviceName, id, listener.address().port)
    if (!done) {
      console.error('error registering at consul')
      process.exit(1)
    }
  })
}

init()
