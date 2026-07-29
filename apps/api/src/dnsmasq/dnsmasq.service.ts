import { Injectable, Logger } from '@nestjs/common'
import { execSync } from 'child_process'
import * as fs from 'fs'

const RESERVATION_FILE = '/etc/dnsmasq.d/vmbr1.conf'

let writeLock = false
async function acquireLock(): Promise<void> {
  while (writeLock) {
    await new Promise(r => setTimeout(r, 100))
  }
  writeLock = true
}

@Injectable()
export class DnsmasqService {
  private readonly logger = new Logger(DnsmasqService.name)

  async addReservation(mac: string, ip: string, hostname: string) {
    await acquireLock()
    try {
      const line = `dhcp-host=${mac},${ip},${hostname}\n`
      fs.appendFileSync(RESERVATION_FILE, line)
      execSync('sudo systemctl reload dnsmasq')
      this.logger.log(`Added DHCP reservation: ${mac} → ${ip} (${hostname})`)
    } finally {
      writeLock = false
    }
  }

  async removeReservation(ip: string) {
    await acquireLock()
    try {
      const content = fs.readFileSync(RESERVATION_FILE, 'utf8')
      const filtered = content
        .split('\n')
        .filter(line => !line.includes(`,${ip},`))
        .join('\n')
      fs.writeFileSync(RESERVATION_FILE, filtered)
      execSync('sudo systemctl reload dnsmasq')
      this.logger.log(`Removed DHCP reservation for IP ${ip}`)
    } finally {
      writeLock = false
    }
  }
}
