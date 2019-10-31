import chalk from 'chalk'
import nexline from 'nexline'
import * as fs from 'fs'
import sqlite3 from 'sqlite3'
import { MonoBehaviourText, traversalOnMonoData, MonoTokenType, MonoObjectToken } from '../mono'
import { MonoToken } from '../mono'
import { listDirectory, fielExists, saveTo } from '../helper/helper'
import { inputPath, dbPath } from '../../config'
import { basename } from 'path'
import { DB_WHITE_LIST, TEXT_LABEL_TXT } from '../../should-parse-to-db'

const DB_FILE = 'output/db/dragatext.sqlite'
const WHITE_LIST: string[] = DB_WHITE_LIST || []

const option = {
  only: process.argv.includes('--only') || false
}

const labels: any = {}

class Sqlite {
  
  dbFile: string
  DB: sqlite3.Database | null
  
  constructor(dbFile: string) {
    this.DB = null
    this.dbFile = dbFile
  }
  
  async open(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbFile, (err) => {
        if (err) {
          return resolve(false)
        }
        this.DB = db
        resolve(true)
      })
    })
  }
  
  async run (sql: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.DB) {
        return reject(new Error('Should open db first'))
      }
      this.DB.run(sql, err => {
        err ? resolve(false) : resolve(true)
      })
    })
  }
  
  async close(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.DB) {
        return reject(new Error('Should open db first'))
      }
      this.DB.close(err => {
        if (err){
          return resolve(false)
        }
        this.DB = null
        resolve(true)
      })
    })
  }
}

const dbHolder = dbPath
const inputHolder = inputPath

const parseText = async (file: string) => {
  console.log(`\nprocessing ${chalk.green(file)} ...`)
  const fd = fs.openSync(file, 'r')
  const reader = nexline({input: fd})
  const token = await MonoBehaviourText.parse(reader, 0, -1, {})
  fs.closeSync(fd)
  return token;
}

const storeLabel = async (token: MonoToken): Promise<any> => {
  const value: { [name: string]: MonoToken } = token.value as { [name: string]: MonoToken }
  if ('Id' in value && 'Text' in value) {
    const id = value['Id'].value as string
    if (id in labels) {
      console.log(chalk.bold(`label ${id} exists`))
    }
    labels[id] = value['Text'].value as string
  }
}

const getLabel = (textId: string): string => {
  return textId in labels ? labels[textId] : textId
}


async function boot () {
  let tables: any = {}
  const db: Sqlite = new Sqlite(DB_FILE)

  const processTextLabel = async (token: MonoToken) => {
    
  }

  
  const createSqlTable = async (token: MonoToken): Promise<any> => {
    const value = (token as MonoObjectToken).value
    for (const key in value) {
      const child = value[key]
      if (child.type !== MonoTokenType.STRING && 
          child.type !== MonoTokenType.NUMBER &&
          child.type !== MonoTokenType.FLOAT
        ) {
        console.log(chalk.red(`[ERROR] invalid data element ${token.key}`))
        return false;
      }
    }

    const column: string[] = []
    const name = token.key.replace(/Element$/, '')
    const sql: string[] = [`CREATE TABLE IF NOT EXISTS "${name}" (`]
    for (const key in value) {
      const child = value[key]
      const primary = child.key.match(/^id$/i) ? '  PRIMARY KEY  NOT NULL' : ''
      const typa = (child.type === 'string') ? 'TEXT' : (child.mono === 'float' ? 'REAL' : 'INTEGER')
      column.push(child.key)
      sql.push(`    "${child.key}" ${typa}${primary},`)
    }
    sql[sql.length - 1] = sql[sql.length - 1].replace(/,$/, '')
    sql.push(');')
    sql.push('')
    
    if (!(name in tables)) {
      tables[name] = {
        name: name,
        columns: column,
        sql: sql.join('\n')
      }
    }
    return true
  }

  const insertEntityData = async (token: MonoToken): Promise<any> => {
    const name = token.key.replace(/Element$/, '')
    const table = tables[name]
    if (!table) {
      return false;
    }

    if (!table.columns.includes('Id')) {
      console.log(chalk.red(`table ${name} has none ID column`))
      return false;
    }

    const value = (token as MonoObjectToken).value
    const failed = table.columns.find((col: string) => {
      return !(col in value) ||
             (value[col].type !== 'string' &&
              value[col].type !== 'number')
    })
    if (failed) {
      return
    }

    // const id = value['Id']
    const cols = table.columns.map(col => `"${col}"`)
    const vals = table.columns.map(col => (value[col].type === 'string') ? `"${getLabel(value[col].value as string)}"` : `${value[col].value}`)

    const sql =
    // `BEGIN\n` +
    // `  IF NOT  (SELECT * FROM "${table.name}" "Id" = "${id.value})\n` +
    // `  BEGIN\n` +
    `    INSERT OR REPLACE INTO "${table.name}" (${cols.join(', ')}) VALUES (${vals.join(', ')})`
    // `  WHERE NOT EXISTS (SELECT * )\n` +
    // `END\n`

    // console.log(chalk.bold(sql))
    try {
      await db.run(sql)
    } catch(e) {
      console.log(chalk.bold(sql))
      console.log(chalk.red(e))
    }
    return true
  }

  const processToken = async (token: MonoToken) => {

    tables = {}
    await db.open()
    
    // create table
    await traversalOnMonoData(token, createSqlTable)
    if (Object.keys(db).length > 1) {
      console.log(`\tmulti entity: ${chalk.red(JSON.stringify(Object.keys(db)))}`)
    }
    for (const key in db) {
      console.log(`\t\tsave sql table in ${chalk.greenBright(key)}`)
      const tableFile = `${dbHolder}/table/${key}.sql`
      await saveTo(db[key].sql, tableFile)
      try {
        await db.run(db[key].sql)
      } catch(e) {
        console.log(chalk.bold(db[key].sql))
        console.log(chalk.red(e, e.stack))
      }
    }

    // insert into
    traversalOnMonoData(token, insertEntityData)

    await db.close()
  }

  // prepare text labels
  const labelToken = await await parseText(`${inputHolder}/${TEXT_LABEL_TXT}`);
  await traversalOnMonoData(labelToken, storeLabel)
  console.log(chalk.green(`text label parsed`))

  if (option.only) {
    for (let index = 2; index < process.argv.length; index++) {
      if (await fielExists(process.argv[index])) {
        await processToken(
          await parseText(process.argv[index])
        )
      }
    }
  }
  else {
    const files = await listDirectory(inputHolder)
    for (const file of files) {
      if (!WHITE_LIST.includes(file.toLocaleLowerCase())) {
        continue
      }
      await processToken(
        await parseText(`${inputHolder}/${file}`)
      )
    }
  }
}

boot()
