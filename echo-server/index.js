const express = require('express')
const Router = require('express-promise-router')
const https = require('https')
const process = require('process')
const fetch = require('node-fetch')
const fs = require('fs')

const httpsCall = (hostname, port, path, certs, body) => {
  const options = {
    hostname,
    port,
    path,
    method: 'PUT',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    ca: certs.ca,
    key: certs.key,
    cert: certs.cert,
  }

  return new Promise((res, rej) => {
    const req = https.request(options, (resp) => {
      let data= ''
      resp.on('data', chunk => data += chunk)
      resp.on('end', () => res(data))
    })

    req.write(body)

    req.on('error', error => rej(error))
    req.end()
  })
}

const registerAsConsulService = async (serviceName, id, tls, certs, port) => {
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

  try {
    if (tls === true) {
      const data = await httpsCall('localhost', 8501, '/v1/agent/service/register?replace-existing-checks=true', certs, JSON.stringify(payload))
      console.log('https response', data)
      return true
    } else {
      let ops = {
        method: 'PUT',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload, null, 2)
      }
        
      const baseUrl = 'http://127.0.0.1:8500'
      await fetch(baseUrl, ops)
      return true
    }
  } catch (e) {
    console.error(e)
    return false
  }
}

const init = async (args) => {

  let certs = {}
  let tls = false
  if (args.length > 0) {
    const arg1 = args[0]
    if (arg1 === 'tls') {
      console.log('use encryption')
      tls = true
      certs.ca = fs.readFileSync('../consul.d/consul-agent-ca.pem')
      certs.cert = fs.readFileSync('../consul.d/dc1-server-consul-0.pem')
      certs.key = fs.readFileSync('../consul.d/dc1-server-consul-0-key.pem')
    }
  }
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
    const done = await registerAsConsulService(serviceName, id, tls, certs, listener.address().port)
    if (!done) {
      console.error('error registering at consul')
      process.exit(1)
    }
  })
}

init(process.argv.slice(2))
