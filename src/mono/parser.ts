import chalk from "chalk";

const EOP = 'EOP'

type MonoType = 'object' | 'array' | 'array-index'| 'number' | 'string' | 'null'

interface MonoProperty {
  key: string;
  type: MonoType;
  typeInMono: string;
  value: null | string | number | { [name: string]: any } | any[];
}

export class MonoBehaviour {
  
  static getObjectToken(items: string[]) {
    if (items.length !== 2) {
      return null
    }
    
    let typeInMono: string = ''
    let key: string = ''
    if (items[0].match(/^(MonoBehaviour|PPtr<)/)) {
      [typeInMono, key] = items
    }
    else if (items[1].match(/^(dict|data)/)) {
      [key, typeInMono] = items
    }
    return !key ? null : {
      type: 'object',
      value: {},
      typeInMono,
      key
    } as MonoProperty
  }
  
  static getArrayToken(items: string[]) {
    if (items.length !== 2) {
      return null
    }
    
    let typeInMono: string = ''
    let key: string = ''
    if (items[0].match(/^(vector)/)) {
      [typeInMono, key] = items
    }
    else if (items[1].match(/^(list|entriesValue)/)) {
      [key, typeInMono] = items
    }
    return !key ? null : {
      type: 'array',
      value: [],
      typeInMono,
      key
    } as MonoProperty
  }
  
  static getArrayIndexToken(items: string[]) {
    if (items.length !== 1) {
      return null
    }
    
    if (items[0].match(/^(\[\d+\])/)) {
      return {
        type: 'array-index',
        value: items[0].replace(/\[|\]/g, ''),
        typeInMono: '',
        key: ''
      } as MonoProperty
    }
    else {
      return null
    }
  }
  
  // SInt64 m_PathID = -7917755486195054967
  static getPropertyToken(items: string[]) {
    if (items.length !== 4 || items[2] !== '=') {
      return null
    }
  
    if (items[0].match(/^(string)/)) {
      return {
        type: 'string',
        key: items[1],
        typeInMono: items[0],
        value: items[3].replace(/(^")|("$)/g, '')
      } as MonoProperty
    }
    else if (items[0].match(/^(int|UInt8|SInt64)/)) {
      return {
        type: 'number',
        key: items[1],
        typeInMono: items[0],
        value: parseInt(items[3], 10)
      } as MonoProperty
    }
    else if (items[0].match(/^(float)/)) {
      return {
        type: 'number',
        key: items[1],
        typeInMono: items[0],
        value: parseFloat(items[3])
      } as MonoProperty
    }
    else {
      return null
    }
  }
  
  static async parse(reader: any, tabs: number, overread: any) {
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
    
    const propertyToken = this.getPropertyToken(items)
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
        
        if (next.key) {
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
        (arrayToken.value as any[]).push(token)
      }
      return arrayToken
    }
    
    const arrayIndexToken = this.getArrayIndexToken(items)
    if (arrayIndexToken) {
      return arrayIndexToken
    }
    
    console.log(chalk.red(`[ERROR] unknown line ${line}`))
    return {
      key: '',
      type: 'null',
      typeInMono: '',
      value: null
    } as MonoProperty
  }
}

