
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
          result.push(`  ${prop.key}: ${prop.type} = ${prop.type === 'number' ? '0' : (prop.type === 'string' ? "''" : 'null')};`)
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
