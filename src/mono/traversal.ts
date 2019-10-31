import chalk from "chalk"

interface MonoTokenBase {
  key: string;
  mono: string;
  line: string;
  tabs: number;
  lines: number;
}

export enum MonoTokenType {
  NULL = 'null',
  STRING = 'string',
  NUMBER = 'number',
  FLOAT = 'float',
  ARRAY = 'array',
  OBJECT = 'object',
  ARRAY_INDEX = 'array-index'
}

export interface MonoEndToken extends MonoTokenBase {
  type: MonoTokenType.NULL;
  value: any;
}

export interface MonoStringToken extends MonoTokenBase {
  type: MonoTokenType.STRING;
  value: string;
}

export interface MonoNumberToken extends MonoTokenBase {
  type:  MonoTokenType.NUMBER;
  value: number;
}

export interface MonoFloatToken extends MonoTokenBase {
  type:  MonoTokenType.FLOAT;
  value: number;
}

export interface MonoArrayIndexToken extends MonoTokenBase {
  type: MonoTokenType.ARRAY_INDEX;
  value: number;
}

export interface MonoArrayToken extends MonoTokenBase {
  type: MonoTokenType.ARRAY;
  value: MonoToken[];
}

export interface MonoObjectToken extends MonoTokenBase {
  type: MonoTokenType.OBJECT;
  value: { [name: string]: MonoToken };
}

export type MonoToken = MonoEndToken | MonoStringToken | MonoNumberToken | MonoFloatToken | MonoArrayIndexToken | MonoArrayToken | MonoObjectToken

export interface MonoTraversalStack {
  tokens:  MonoToken[];
  lines: number,
  top: number
}

export const stackParent = (token: MonoToken, stack: MonoTraversalStack): MonoToken | null => {
  return stack.top > 0 ? stack.tokens[stack.top - 1] : null
}

export type OnTokenParsed = (token: MonoToken, stack: MonoTraversalStack) => Promise<any>

const monoEndToken: MonoEndToken = {
  key: '',
  mono: '',
  line: '',
  tabs: -1,
  lines: 0,
  value: {},
  type: MonoTokenType.NULL
}

const EXCLUDE_TOKEN = [
  { mono: /^vector/, key: /^entriesHashCode/ },
  { mono: /^vector/, key: /^entriesNext/ },
  { mono: /^vector/, key: /^entriesKey/ },
  { mono: /^vector/, key: /^buckets/ },

  { mono: /^PPtr</, key: /^GameObject/ },
  { mono: /^UInt8/, key: /^Enabled/ },
  { mono: /^PPtr</, key: /^Script/ },

  { mono: /^int/, key: /^freeCount/ },
  { mono: /^int/, key: /^freeList/ }
]

export class MonoBehaviourText {

  static isExcludeToken(token: MonoToken): boolean {
    return !!EXCLUDE_TOKEN.find(exclude => {
      return token.key.match(exclude.key) && token.mono.match(exclude.mono)
    })
  }

  static isEmptyObjectToken(token: MonoToken): boolean {
    if (token.type !== MonoTokenType.OBJECT) {
      return false
    }
    for (const key in token.value) {
      if (!!token.value[key] && !!token.value[key].value) {
        return false
      }
    }
    return true
  }
  
  static async parse(reader: any, lines: number, tabs: number, overread: any): Promise<MonoToken> {
    let line: string | null
    if (overread.readed) {
      line = overread.line
      overread.line = ''
      overread.readed = false
    }
    else {
      line = await reader.next()
      lines += 1
    }
    const token = this.parseToken(line, lines)
    const thisTabs = this.getTabs(line)
    
    if (token.type === MonoTokenType.NULL || (thisTabs!== tabs + 1)) {
      overread.readed = true
      overread.line = line
      return monoEndToken
    }
    
    if (token.type === MonoTokenType.OBJECT) {
      const excludeMe = this.isExcludeToken(token)
      while (true) {
        const next = await this.parse(reader, lines, tabs + 1, overread)
        if (next.type === MonoTokenType.NULL || next.type === MonoTokenType.ARRAY_INDEX) {
          break;
        }

        if (!excludeMe && next.key && !this.isExcludeToken(next)) {
          (token as MonoObjectToken).value[next.key] = next
        }
      }
    }
    else if (token.type === MonoTokenType.ARRAY) {
      const excludeMe = this.isExcludeToken(token)
      const line1 = await reader.next()
      const line2 = await reader.next()
      if (!line1.match(/Array Array/) || !line2.match(/int size = \d+/)) {
        console.log(chalk.red(`[ERROR] array token: ${line} ${line1} ${line2}`))
      }
      // TODO:
      while (true) {
        const next = await this.parse(reader, lines + 2, tabs + 2, overread)
        if (next.type !== MonoTokenType.ARRAY_INDEX) {
          break;
        }

        const child = await this.parse(reader, lines + 2, tabs + 2, overread)
        if (child.type === MonoTokenType.NULL || child.type === MonoTokenType.ARRAY_INDEX)  {
          break;
        }
        if (!excludeMe && !this.isEmptyObjectToken(child)) {
          (child as MonoArrayToken).value.push(child)
        }
      }
    }
    
    return token
  }

  static async traversal(reader: any, onTokenParseStart?: OnTokenParsed, onTokenParseEnd?: OnTokenParsed): Promise<any> {
    const stack: MonoTraversalStack = {
      top: 0,
      lines: 0,
      tokens: [monoEndToken]
    }
    
    const top = (): MonoToken => {
      return stack.tokens[stack.top]
    }
    
    const pop = async () => {
      // TODO: token full parsed 
      if (onTokenParseEnd instanceof Function) {
        await onTokenParseEnd(top(), stack)
      }
      delete stack.tokens[stack.top]
      stack.top -= 1
    }
    
    const push = (token: MonoToken) => {
      stack.top += 1
      stack.tokens[stack.top] = token
    }
    
    try {
      while (true) {
        stack.lines += 1
        const line: string | null = await reader.next()
        if (stack.lines % 10000 == 0) {
          console.log(chalk.bold(`#${stack.lines}`))
        }
        
        const token = this.parseToken(line, stack.lines)
        while (stack.top > 0 && token.tabs <= top().tabs) {
          await pop()
        }
        
        push(token)
        if (onTokenParseStart instanceof Function) {
          await onTokenParseStart(token, stack)
        }
        
        if (token.type === MonoTokenType.NULL) {
          break;
        }
        
        // array type tunning start
        if (token.type === MonoTokenType.ARRAY) {
          const line1 = await reader.next()
          const line2 = await reader.next()
          if (!line1.match(/Array Array/) || !line2.match(/int size = \d+/)) {
            console.log(`[ERROR] array token: ${line} ${line1} ${line2}`)
            throw new Error(`Invalid array token #${stack.lines} ${line} ${line1} ${line2}`)
          }
          stack.lines += 2
        }
        // array type tunning end.
      }
    } catch(e) {
      console.log(chalk.red(`Exception on line #${stack.lines}\n\n${e}\n\n${e.stack}`))
    }
    return stack.lines
  }

  static parseToken(line: string | null, lines: number): MonoToken {
    if (!line) {
      return monoEndToken
    }
    
    let token = 
      this.parseNumberToken(line, lines) ||
      this.parseStringToken(line, lines) ||
      this.parseObjectToken(line, lines) ||
      this.parseFloatToken(line, lines) ||
      this.parseArrayToken(line, lines) ||
      this.parseArrayIndexToken(line, lines)
      
    if (!token) {
      throw new Error(`Unknown line, #${lines} ${line}`)
    }
    return token
  }
  
  private static normalizeKey(key: string): string {
    return key.replace(/^m?_/, '')
  }
  
  static getTabs(line: string | null): number {
    if (!line) {
      return 0
    }
    const matched = line.match(/^(\t*)/)
    return matched ? matched[1].length : 0
  }
  
  private static parseStringToken(line: string, lines: number): MonoStringToken | null {
    const matched = line.match(/^\t*(string) (\w+) = (.+)\r$/)
    if (!matched) {
      return null
    }

    const value: string = matched[3]
    return {
      key:  this.normalizeKey(matched[2]),
      mono: matched[1],
      line: line,
      tabs: this.getTabs(line),
      lines: lines,
      type: MonoTokenType.STRING,
      value: value.replace(/(^")|("$)/g, '')
    } as MonoStringToken
  }
  
  private static parseNumberToken(line: string, lines: number): MonoNumberToken | null {
    const matched = line.match(/^\t*(int|UInt8|SInt64) (\w+) = (.+)\r$/)
    if (!matched) {
      return null
    }

    const value: string = matched[3].replace(/\r/g, '')
    return {
      key:  this.normalizeKey(matched[2]),
      mono: matched[1],
      line: line,
      tabs: this.getTabs(line),
      lines: lines,
      type: MonoTokenType.NUMBER,
      value: parseInt(value, 10)
    } as MonoNumberToken
  }
  
  private static parseFloatToken(line: string, lines: number): MonoFloatToken | null {
    const matched = line.match(/^\t*(float) (\w+) = (.+)\r$/)
    if (!matched) {
      return null
    }

    const value: string = matched[3].replace(/\r/g, '')
    return {
      key:  this.normalizeKey(matched[2]),
      mono: matched[1],
      line: line,
      tabs: this.getTabs(line),
      lines: lines,
      type: MonoTokenType.FLOAT,
      value: parseFloat(value)
    } as MonoFloatToken
  }
  
  private static parseObjectToken(line: string, lines: number): MonoObjectToken | null {
    const items = line.replace(/\t|\r/g, '').split(/\s+/)
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
    return (!key) ? null : {
      key:  this.normalizeKey(key),
      mono: mono,
      line: line,
      tabs: this.getTabs(line),
      lines: lines,
      type: MonoTokenType.OBJECT,
      value: {}
    } as MonoObjectToken
  }

  private static parseArrayToken(line: string, lines: number): MonoArrayToken | null {
    const items = line.replace(/\t|\r/g, '').split(/\s+/)
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
    return (!key) ? null : {
      key:  this.normalizeKey(key),
      mono: mono,
      line: line,
      tabs: this.getTabs(line),
      lines: lines,
      type: MonoTokenType.ARRAY,
      value: []
    } as MonoArrayToken
  }

  static parseArrayIndexToken(line: string, lines: number): MonoArrayIndexToken | null {
    const items = line.replace(/\t|\r/g, '').split(/\s+/)
    if (items.length !== 1) {
      return null
    }
    
    const matched = items[0].match(/^\[(\d+)\]/)
    return (!matched) ? null : {
      key:  '',
      mono: '',
      line: line,
      tabs: this.getTabs(line),
      lines: lines,
      type: MonoTokenType.ARRAY_INDEX,
      value: parseInt(matched[1], 10)
    } as MonoArrayIndexToken
  }

}
