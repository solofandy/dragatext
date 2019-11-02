import sqlite3 from 'sqlite3'
import { MonoObjectToken, MonoBehaviourText, MonoTokenType } from './traversal'

export interface MonoTable {
  sql: string;
  orm: string;
  name: string;
  columns: string[];
}

export class Sqlite {

  fileName: string
  connection: sqlite3.Database | null

  constructor(fileName: string) {
    this.fileName = fileName
    this.connection = null
  }

  genCreateTable (objectToken: MonoObjectToken): MonoTable | null {
    if (Object.values(objectToken.value).find(child => !MonoBehaviourText.isPropertyToken(child))) {
      return null
    }

    const types = {}
    types[MonoTokenType.FLOAT] = 'REAL'
    types[MonoTokenType.STRING] = 'TEXT'
    types[MonoTokenType.NUMBER] = 'INTEGER'

    const cols: string[] = []
    const name = objectToken.key.replace(/Element$/, '')
    const sql: string[] = [`CREATE TABLE IF NOT EXISTS "${name}" (`]
    Object.values(objectToken.value).forEach(child => {
      const primary = child.key.match(/^id$/i) ? '  PRIMARY KEY  NOT NULL' : ''
      sql.push(`    "${child.key}" ${types[child.type]}${primary},`)
      cols.push(child.key)
    })
    sql[sql.length - 1] = sql[sql.length - 1].replace(/,$/, '')
    sql.push(');')
    sql.push('')

    return {
      name: name,
      columns: cols,
      sql: sql.join('\n'),
      orm: this.genTypeorm(objectToken)
    }
  }

  genTypeorm (objectToken: MonoObjectToken): string {
    if (Object.values(objectToken.value).find(child => !MonoBehaviourText.isPropertyToken(child))) {
      return ''
    }

    const orm: string[] = []
    const name = objectToken.key.replace(/Element$/, '')

    orm.push(`import { MonoEntity } from './MonoEntity'`)
    orm.push(`import { Entity, Column, PrimaryColumn } from 'typeorm'`)
    orm.push(``)
    orm.push(`@Entity({`)
    orm.push(`  name: '${name}'`)
    orm.push(`})`)
    orm.push(`export class ${name} extends MonoEntity \{`)
    orm.push(``)
    orm.push(`  static entity: string = '${name}'`)
    orm.push(``)
    orm.push(`// '${name}': { name: '${name}', columns: ${name}.columns, entity: ${name} },`)
    orm.push(`  static columns: string[] = [${Object.keys(objectToken.value).map(name => `'${name}'`).join(', ')}]`)

    Object.values(objectToken.value).forEach(child => {
      const column = child.key.match(/^id$/i) ? '@PrimaryColumn()' : '@Column()'
      orm.push('')
      orm.push(`  ${column}`)
      if (child.type === MonoTokenType.STRING) {
        orm.push(`  ${child.key}: string = ''`)
      }
      else {
        orm.push(`  ${child.key}: number = 0`)
      }
    })
    orm.push(`}`)
    orm.push(``)
    return orm.join('\n')
  }

  genInsertInto (table: MonoTable, objectToken: MonoObjectToken, labels: { [name: string]: string }, replace?: boolean): string {
    if (
      table.columns.find(col => !(col in objectToken.value)) ||
      Object.values(objectToken.value).find(child => !MonoBehaviourText.isPropertyToken(child))
    ) {
      return ''
    }

    const getLabel = (name: string): string => {
      const val = ((name in labels) ? labels[name] : name) || ''
      return val.replace(/"/, '\\"')
    }

    const children = objectToken.value
    const cols = table.columns.map(col => `"${col}"`)
    const vals = table.columns.map(col => {
      switch (children[col].type) {
        case MonoTokenType.STRING:
          return '"' + getLabel(children[col].value) + '"'
        default:
          return `${children[col].value}`
      }
    })
    const replaceCmd = replace ? 'OR REPLACE' : ''
    return `INSERT ${replaceCmd} INTO "${table.name}" (${cols.join(', ')}) VALUES (${vals.join(', ')});`
  }

  async open(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.fileName, (err) => {
        if (err) {
          return resolve(false)
        }
        this.connection = db
        resolve(true)
      })
    })
  }

  async run (sql: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.connection) {
        return reject(new Error('Should open db first'))
      }
      this.connection.run(sql, err => {
        err ? resolve(false) : resolve(true)
      })
    })
  }

  async close (): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.connection) {
        return reject(new Error('Should open db first'))
      }
      this.connection.close(err => {
        if (err){
          return resolve(false)
        }
        this.connection = null
        resolve(true)
      })
    })
  }
}
