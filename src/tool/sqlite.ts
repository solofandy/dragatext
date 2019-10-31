import chalk from 'chalk'
import nexline from 'nexline'
import * as fs from 'fs'
import sqlite3 from 'sqlite3'
import { MonoBehaviour } from '../mono/parser'
import { MonoToken, EOP, traversalOnMonoData } from '../mono/mono'
import { listDirectory, fielExists, saveTo } from '../helper/helper'
import { inputPath, dbPath } from '../../config'
import { basename } from 'path'
import { DB_WHITE_LIST, TEXT_LABEL_TXT } from '../../should-parse-to-db'

const DB_FILE = 'output/db/dragatext.sqlite'
const WHITE_LIST: string[] = DB_WHITE_LIST || []

const option = {
  only: process.argv.includes('--only') || false
}

const dbHolder = dbPath
const inputHolder = inputPath

async function parseText(file: string) {
  console.log(`\nprocessing ${chalk.green(file)} ...`)
  const filebase = basename(file).toLowerCase()
  const fd = fs.openSync(file, 'r')
  const reader = nexline({input: fd})
  const token = await MonoBehaviour.parse(reader, -1, {})
  fs.closeSync(fd)

  if (token === EOP) {
    console.log(chalk.red(`[ERROR] file ${file} is empty`))
  }
  return token;
}

async function dbOpen (file: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, (err) => {
      if (err) {
        return reject(err)
      }
      resolve(db)
    })
  })
}

async function dbClose (DB: sqlite3.Database) {
  return new Promise((resolve, reject) => {
    DB.close(err => {
      err ? reject(err) : resolve(true)
    })
  })
}

async function dbRun (DB: sqlite3.Database, sql: string) {
  return new Promise((resolve, reject) => {
    DB.run(sql, err => {
      err ? reject(err) : resolve(true)
    })
  })
}

async function boot () {

  const labels: any = {}

  let db: any
  let SQLITE: sqlite3.Database

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

  const processTextLabel = async (token: MonoToken | 'EOP') => {
    if (token === EOP) {
      return ;
    }

    traversalOnMonoData(token, storeLabel)
    console.log(chalk.green(`text label parsed`))
  }

  const getLabel = (textId: string): string => {
    return textId in labels ? labels[textId] : textId
  }

  const createSqlTable = async (token: MonoToken): Promise<any> => {
    const value: { [name: string]: MonoToken } = token.value as { [name: string]: MonoToken }
    for (const key in value) {
      const child = value[key]
      if (child.type !== 'number' && child.type !== 'string') {
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
    if (!(name in db)) {
      db[name] = {
        name: name,
        columns: column,
        sql: sql.join('\n')
      }
    }
    return true
  }

  const insertEntityData = async (token: MonoToken): Promise<any> => {
    const name = token.key.replace(/Element$/, '')
    const table = db[name]
    if (!table) {
      return false;
    }

    if (!table.columns.includes('Id')) {
      console.log(chalk.red(`table ${name} has none ID column`))
      return false;
    }

    const value: { [name: string]: MonoToken } = token.value as { [name: string]: MonoToken }
    const failed = table.columns.find((col: string) => {
      return !(col in value) ||
             (value[col].type !== 'string' &&
              value[col].type !== 'number')
    })
    if (failed) {
      return
    }

    const id = value['Id']
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
      await dbRun(SQLITE, sql)
    } catch(e) {
      console.log(chalk.bold(sql))
      console.log(chalk.red(e))
    }
    return true
  }

  const processToken = async (token: MonoToken | 'EOP') => {
    if (token === EOP) {
      return ;
    }

    db = {}
    SQLITE = await dbOpen(DB_FILE)
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
        await dbRun(SQLITE, db[key].sql)
      } catch(e) {
        console.log(chalk.bold(db[key].sql))
        console.log(chalk.red(e))
      }
    }

    // insert into
    traversalOnMonoData(token, insertEntityData)

    await dbClose(SQLITE)
  }

  await processTextLabel(
    await parseText(`${inputHolder}/${TEXT_LABEL_TXT}`)
  )

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
