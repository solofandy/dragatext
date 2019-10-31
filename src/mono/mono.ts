
export const EOP: 'EOP' = 'EOP'

export type MonoTokenType = 'object' | 'array' | 'array-index'| 'number' | 'string' | 'null'

export interface MonoToken {
  key: string;
  mono: string;
  type: MonoTokenType;
  value: string | number | { [name: string]: MonoToken } | MonoToken[] | null;
}

export const generateMonoSchema = (token: MonoToken, onArrayCut?: any): MonoToken => {
  switch (token.type) {
    case 'object': {
      const t = {
        key: token.key,
        mono: token.mono,
        type: token.type,
        value: {}
      }
      const value: { [name: string]: MonoToken } = token.value as { [name: string]: MonoToken }
      for (const key in value) {
        t.value[key] = generateMonoSchema(value[key], onArrayCut)
      }
      return t
    }
    case 'array': {
      const t = {
        key: token.key,
        mono: token.mono,
        type: token.type,
        value: []
      }
      const value: MonoToken[] = token.value as MonoToken[]
      if (value.length > 0) {
        if (onArrayCut) {
          onArrayCut(token)
        }
        (t.value as MonoToken[]).push(value[0])
      }
      return t
    }
    default: {
      return { ... token }
    }
  }
}

export const generateMonoTs = (token: MonoToken, types: any): any => {
  switch (token.type) {
    case 'object': {
      const value: { [name: string]: MonoToken } = token.value as { [name: string]: MonoToken }
      if (token.mono === 'data') {
        let result = [`class ${token.key} {`]
        for (const key in value) {
          const prop = value[key]
          result.push(`  ${prop.key}: ${prop.type} = ${prop.type === 'number' ? '0' : (prop.type === 'string' ? "''" : 'null')}\n`)
        }
        result.push('}')
        result.push('')
        types[token.key] = result.join('\n')
      }

      for (const key in value) {
        generateMonoTs(value[key], types)
      }
    }

    case 'array': {
      const result: any[] = []
      const value: MonoToken[] = token.value as MonoToken[]
      if (value.length > 0) {
        generateMonoTs(value[0], types)
      }
    }
  }
}

export type OnMonoData = (token: MonoToken) => Promise<any>

// const traversal =
export const traversalOnMonoData = async (token: MonoToken, onMonoData?: OnMonoData) => {
  switch (token.type) {
    case 'object': {
      const value: { [name: string]: MonoToken } = token.value as { [name: string]: MonoToken }
      if (token.mono === 'data' && onMonoData) {
        await onMonoData(token)
      }

      // if (token.mono === 'data' && token.key.match(keyPattern)) {
      //   const failed = columns.find(col => {
      //     return !(col in value) ||
      //           (value[col].type !== 'string' &&
      //            value[col].type !== 'number')
      //   })

      //   if (!failed) {
      //     const cols = columns.map(col => `"${col}"`)
      //     const vals = columns.map(col => (value[col].type === 'string') ? `"${value[col].value}"` : `${value[col].value}}`)
      //     const sql = `INSERT INTO "${tableName} (${cols.join(', ')}) VALUES (${vals.join(', ')})`
      //   }
      // }

      for (const key in value) {
        await traversalOnMonoData(value[key], onMonoData)
      }
    }

    case 'array': {
      const value: MonoToken[] = token.value as MonoToken[]
      for (const item of value) {
        await traversalOnMonoData(item, onMonoData)
      }
    }
  }

}

export const generateMonoJson = (token: MonoToken): any => {
  switch (token.type) {
    case 'object': {
      const result: any = {}
      const value: { [name: string]: MonoToken } = token.value as { [name: string]: MonoToken }
      for (const key in value) {
        result[key] = generateMonoJson(value[key])
      }
      return result
    }
    case 'array': {
      const result: any[] = []
      const value: MonoToken[] = token.value as MonoToken[]
      for (const i in value) {
        result.push(generateMonoJson(value[i]))
      }
      return result
    }
    default:
      return token.value
  }
}
