import chalk from "chalk";
import { MonoToken, EOP } from "./mono";

const EXCLUDE_TOKEN = [
  { mono: /^vector/, key: /^entriesHashCode/ },
  { mono: /^vector/, key: /^entriesNext/ },
  { mono: /^vector/, key: /^entriesKey/ },
  { mono: /^vector/, key: /^buckets/ },

  { mono: /^PPtr</, key: /^GameObject/ },
  { mono: /^UInt8/, key: /^Enabled/ },
  { mono: /^PPtr</, key: /^Script/ },

  { mono: /^int</, key: /^freeCount/ },
  { mono: /^int</, key: /^freeList/ }
]

export class MonoBehaviour {

  private static isExcludeToken(token: MonoToken): boolean {
    return !!EXCLUDE_TOKEN.find(exclude => {
      return token.key.match(exclude.key) && token.mono.match(exclude.mono)
    })
  }

  private static isEmptyObjectToken(token: MonoToken): boolean {
    if (token.type !== 'object') {
      return false
    }
    const value: { [name: string]: MonoToken } = token.value as { [name: string]: MonoToken }
    for (const key in value) {
      if (!!value[key] && !!value[key].value) {
        return false
      }
    }
    return true
  }

  private static normalizeKey(key: string): string {
    return key.replace(/^m?_/, '')
  }

  // Fixit: fix EOP type declaration
  static async parse(reader: any, tabs: number, overread: any): Promise<'EOP' | MonoToken> {
    let line: string | null
    if (overread.readed) {
      line = overread.line
      overread.line = ''
      overread.readed = false
      // console.log(`[overread] ${line}`)
    }
    else {
      line = await reader.next()
    }
    if (!line || (line.match(/\t/g) || []).length !== tabs + 1) {
      overread.readed = true
      overread.line = line
      return EOP
    }

    const items = line.replace(/\t|\r/g, '').split(/\s+/)

    const propertyToken = this.getPropertyToken(line)
    if (propertyToken) {
      return propertyToken
    }

    const objectToken = this.getObjectToken(items)
    // console.log('[object]', objectEntry)
    if (objectToken) {
      while (true) {
        const next = await this.parse(reader, tabs + 1, overread)
        if (!next || next === EOP || next.type === 'array-index') {
          break;
        }

        if (next.key && !this.isExcludeToken(next)) {
          (objectToken.value as any)[next.key] = next
        }
      }
      return objectToken
    }

    const arrayToken = this.getArrayToken(items)
    if (arrayToken) {
      const a1 = await reader.next()
      const a2 = await reader.next()
      if (!a1.match(/Array Array/) || !a2.match(/int size = \d+/)) {
        console.log(chalk.red(`[ERROR] array token: ${line} ${a1} ${a2}`))
      }
      // TODO:
      while (true) {
        const next = await this.parse(reader, tabs + 2, overread)
        if (!next || next === EOP || next.type !== 'array-index') {
          break;
        }

        const token = await this.parse(reader, tabs + 2, overread)
        if (!token || token === EOP || token.type === 'array-index') {
          break;
        }
        if (!this.isEmptyObjectToken(token)) {
          (arrayToken.value as MonoToken[]).push(token)
        }
      }
      return arrayToken
    }

    const arrayIndexToken = this.getArrayIndexToken(items)
    if (arrayIndexToken) {
      return arrayIndexToken
    }

    console.log(chalk.red(`[ERROR] unknown line ${line}`))
    throw new Error(`Unable to parse ${line}`)
  }

  private static getObjectToken(items: string[]): MonoToken | null {
    if (items.length !== 2) {
      return null
    }

    let mono: string = ''
    let key: string = ''
    if (items[0].match(/^(MonoBehaviour|PPtr<)/)) {
      [mono, key] = items
    }
    else if (items[1].match(/^(dict|data)/)) {
      [key, mono] = items
    }
    return !key ? null : {
      key: this.normalizeKey(key),
      type: 'object',
      value: {},
      mono
    } as MonoToken
  }

  private static getArrayToken(items: string[]): MonoToken | null {
    if (items.length !== 2) {
      return null
    }

    let mono: string = ''
    let key: string = ''
    if (items[0].match(/^(vector)/)) {
      [mono, key] = items
    }
    else if (items[1].match(/^(list|entriesValue)/)) {
      [key, mono] = items
    }
    return !key ? null : {
      key: this.normalizeKey(key),
      type: 'array',
      value: [],
      mono
    } as MonoToken
  }

  static getArrayIndexToken(items: string[]): MonoToken | null {
    if (items.length !== 1) {
      return null
    }

    if (items[0].match(/^(\[\d+\])/)) {
      return {
        type: 'array-index',
        value: items[0].replace(/\[|\]/g, ''),
        mono: '',
        key: ''
      } as MonoToken
    }
    else {
      return null
    }
  }

  private static getPropertyToken(line: string): MonoToken | null {
    const matched = line.match(/^\t*(string|int|UInt8|SInt64|float) (\w+) = (["-\w]+)/)
    if (!matched) {
      return null
    }

    const value: string = matched[3].replace(/\r/g, '')
    const token: MonoToken = {
      key:  this.normalizeKey(matched[2]),
      mono: matched[1],
      type: 'number',
      value: 0
    }

    if (token.mono.match(/^(string)/)) {
      token.type = 'string'
      token.value = value.replace(/(^")|("$)/g, '')
    }
    else if (token.mono.match(/^(int|UInt8|SInt64)/)) {
      token.value = parseInt(value, 10)
    }
    else if (token.mono.match(/^(float)/)) {
      token.value = parseFloat(value)
    }
    else {
      return null
    }
    return token
  }

}

