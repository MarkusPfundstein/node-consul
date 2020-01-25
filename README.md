# Experiments related to Node & Consul

## Hardware: 
2 ubuntu machines on aws with consul installed and ports 8301 and 8300 open and ports 30000-45000 open for services
Tip: Make custom security group

Always run at least 3 consul servers. Best is uneven number.
Ports: 8301 (consul-join), 8300 (consul-rpc)

Query all kinds 

## Experiment 1

Setup small network of consul agents and test how we can query them

Installing consul is as easy as downloading binary from https://www.consul.io/downloads.html and putting it into some $PATH aware dir.

Start consul server with name consul1 (-bootstrap because its the very first server. Subsequent ones can omit it).

`consul agent -server -bootstrap -data-dir /tmp/consul -node consul1`

Start agent with name agent1 and connect to cluster where consul1 is server (assume ip of consul1 is 172.31.39.35 - you need to know at least 1 ip)

`consul agent -node agent1 -join 172.31.39.35 -data-dir /tmp/consul`

Resolve agent1 ip via dns on 8600

`dig @127.0.0.1 -p 8600 agent1.node.consul`

Query node consul1:

`curl $(dig +short @127.0.0.1 -p 8600 consul1.node.consul):<PORT>/<PATH>`

## Experiment 2

Register service at consul1 and query from agent1

Notes:
- Every service needs to implement method for health check (tcp/http/docker etc.)
- Every service needs to register itself on startup (e.g. via http or via cmd line consul)
- Deregistering is necessary. For that we can use the Check object during registration (see below for http example) 
- All ports the service can take should be open for internal calls

Register on service startup
```
  5 const registerAsConsulService = async (serviceName, id, port) => {
  6  const payload = {
  7    ID: serviceName + '.' + id,
  8    Name: serviceName,
  9    Tags: ["test-service", "v1.0.0"],
 10    Port: port,
 11    EnableTagOverride: false,
 12    Check: {
 13      Http: 'http://localhost:' + port + '/health',
 14      Method: 'GET',
 15      Interval: '5s',
 16      Timeout: '1s',
 17      DeregisterCriticalServiceAfter: "5s",
 18    }
 19  }
 20
 21  console.log(payload)
 22
 23  try {
 24    const ops = {
 25      method: 'PUT',
 26      headers: {
 27        'Accept': 'application/json',
 28        'Content-Type': 'application/json',
 29      },
 30      body: JSON.stringify(payload, null, 2)
 31    }
 32
 33    await fetch('http://127.0.0.1:8500/v1/agent/service/register?replace-existing-checks=true', ops)
 34    return true
 35  } catch (e) {
 36    console.error(e)
 37    return false
 38  }
 39 }
 ```

Query members:

`http://127.0.0.1:8500/v1/agent/members`

-> same as cmd line ‘consul members’

Retrieve the services registered at consul. ‘Consul-echo-service’ should be part of it.

`curl localhost:8500/v1/catalog/services`

Dig its dns name and port

`dig @127.0.0.1 -p 8600 consul-echo-service.service.consul SRV +short`

Resolve dns name to ip

`dig @127.0.0.1 -p 8600 consul1.node.dc1.consul +short`

##Experiment 3

Call service registered at consul from node by service name

Note: Added complexity because we first need to resolve dns. This in done in three steps
(1) resolve SRV and get potential targets + port
(2) take Head and resolve to ips
(3) take Head of ips and combine with port

```
  5 const consulFetch = (serviceName, path, ops, protocol='http') => {
  6  return new Promise((res, rej) => {
  7    // first, resolve Srv to get port and dns lookups
  8    dns.resolveSrv(serviceName + '.service.consul', (err, srvEntries) => {
  9      if (err) {
 10        return rej(err)
 11      }
 12      if (srvEntries.length === 0) {
 13        return rej(new Error('Error resolving SRV for ' + serviceName))
 14      }
 15      // get head of srvEntries
 16      const srvHead = srvEntries[0]
 17      const port = srvHead.port
 18
 19      return res({
 20        srvHead,
 21        port,
 22      })
 23    })
 24  }).then(({ srvHead, port }) => {
 25    return new Promise((res, rej) => {
 26      dns.resolve(srvHead.name, (err2, ips) => {
 27        if (err2) {
 28          return rej(err2)
 29        }
 30        if (ips.length === 0) {
 31          return rej(new Error('Error resolving ips for ' + serviceName))
 32        }
 33        const ip = ips[0]
 34        return res({
 35          ip,
 36          port,
 37        })
 38      })
 39    })
 40  }).then(({ ip, port }) => {
 41    const url = urlJoin(protocol + '://' + ip + ':' + port, path)
 42    return fetch(url, ops).then(res => res.text())
 43  })
 44 }
 ```
