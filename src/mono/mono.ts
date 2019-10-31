import { MonoToken, MonoTokenType } from './traversal'

export const generateMonoSchema = (token: MonoToken, onArrayCut?: any): MonoToken => {
  return token // FIXITE
  // switch (token.type) {
  //   case 'object': {
  //     const t = {
  //       key: token.key,
  //       mono: token.mono,
  //       type: token.type,
  //       value: {}
  //     }
  //     const value: { [name: string]: MonoToken } = token.value as { [name: string]: MonoToken }
  //     for (const key in value) {
  //       t.value[key] = generateMonoSchema(value[key], onArrayCut)
  //     }
  //     return t
  //   }
  //   case 'array': {
  //     const t = {
  //       key: token.key,
  //       mono: token.mono,
  //       type: token.type,
  //       value: []
  //     }
  //     const value: MonoToken[] = token.value as MonoToken[]
  //     if (value.length > 0) {
  //       if (onArrayCut) {
  //         onArrayCut(token)
  //       }
  //       (t.value as MonoToken[]).push(value[0])
  //     }
  //     return t
  //   }
  //   default: {
  //     return { ... token }
  //   }
  // }
}

export const generateMonoTs = (token: MonoToken, types: any): any => {
  switch (token.type) {
    case MonoTokenType.OBJECT: {
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

    case MonoTokenType.ARRAY: {
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
    case MonoTokenType.OBJECT: {
      const value: { [name: string]: MonoToken } = token.value as { [name: string]: MonoToken }
      if (token.mono === 'data' && onMonoData instanceof Function) {
        await onMonoData(token)
      }

      for (const key in value) {
        await traversalOnMonoData(value[key], onMonoData)
      }
    }

    case MonoTokenType.ARRAY: {
      const value: MonoToken[] = token.value as MonoToken[]
      for (const item of value) {
        await traversalOnMonoData(item, onMonoData)
      }
    }
  }

}

export const generateMonoJson = (token: MonoToken): any => {
  switch (token.type) {
    case MonoTokenType.OBJECT: {
      const result: any = {}
      const value: { [name: string]: MonoToken } = token.value as { [name: string]: MonoToken }
      for (const key in value) {
        result[key] = generateMonoJson(value[key])
      }
      return result
    }
    case MonoTokenType.ARRAY: {
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
