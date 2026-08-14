import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { waitForPort as defaultWait } from './port-waiter.js'

export class DshService extends EventEmitter {
  constructor({ nodePath, dshEntry, dshHome, port, env, logStream, waitForPortImpl = defaultWait, spawnImpl = spawn, profile = 'web' }) {
    super()
    this.nodePath = nodePath
    this.dshEntry = dshEntry
    this.dshHome = dshHome
    this.port = port
    this.env = env
    this.logStream = logStream
    this.waitForPort = waitForPortImpl
    this.spawnImpl = spawnImpl
    this.profile = profile
    this.child = null
  }

  start() {
    return new Promise(async (resolve, reject) => {
      const args = [this.dshEntry, '--profile', this.profile, '--port', String(this.port)]
      const child = this.spawnImpl(this.nodePath, args, {
        cwd: process.cwd(),
        env: { ...process.env, ...this.env, DSH_HOME: this.dshHome },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      this.child = child
      this._attachStreams(child)

      child.once('exit', (code, signal) => {
        if (this._started) this.emit('exit', code, signal)
        else reject(new Error(`dsh 进程启动失败 exit (code=${code}, signal=${signal})`))
      })
      child.once('error', (err) => {
        if (this._started) this.emit('error', err)
        else reject(err)
      })

      const ready = await this.waitForPort(this.port)
      if (!ready) {
        reject(new Error('dsh 进程启动失败 exit (端口等待超时)'))
        return
      }
      this._started = true
      resolve()
    })
  }

  stop() {
    if (!this.child || this.child.exitCode != null) return Promise.resolve()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        try { this.child.kill() } catch {}
      }, 5000)
      this.child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      this.child.kill()
    })
  }

  async restart(profile) {
    // profiles:switch 语义：stop 当前 service → 以新 profile 重建
    if (profile) this.profile = profile
    await this.stop()
    this._started = false
    await this.start()
  }

  _attachStreams(child) {
    if (child.stdout) child.stdout.on('data', (d) => this.logStream.write(d))
    if (child.stderr) child.stderr.on('data', (d) => this.logStream.write(d))
  }
}
