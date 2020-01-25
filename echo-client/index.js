const dns = require('dns')
const fetch = require('node-fetch')
const urlJoin = require('url-join')

const consulFetch = (serviceName, path, ops, protocol='http') => {
  return new Promise((res, rej) => {
    // first, resolve Srv to get port and dns lookups
    dns.resolveSrv(serviceName + '.service.consul', (err, srvEntries) => {
      if (err) {
        return rej(err)
      }
      if (srvEntries.length === 0) {
        return rej(new Error('Error resolving SRV for ' + serviceName))
      }
      // get head of srvEntries
      const srvHead = srvEntries[0]
      const port = srvHead.port

      return res({
        srvHead,
        port,
      })
    })
  }).then(({ srvHead, port }) => {
    return new Promise((res, rej) => {
      dns.resolve(srvHead.name, (err2, ips) => {
        if (err2) {
          return rej(err2)
        }
        if (ips.length === 0) {
          return rej(new Error('Error resolving ips for ' + serviceName))
        }
        const ip = ips[0]
        return res({
          ip,
          port,
        })
      })
    })
  }).then(({ ip, port }) => {
    const url = urlJoin(protocol + '://' + ip + ':' + port, path)
    return fetch(url, ops).then(res => res.text())
  })
}


const main = async () => {
  try {
    dns.setServers(['127.0.0.1:8600'])

    const content = await consulFetch('consul-echo-service', '/echo/Hello World')
    console.log(content)

  } catch (error) {
    console.error('ERROR', error)
  }
}

main()
