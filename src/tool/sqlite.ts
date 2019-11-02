import chalk from 'chalk'
import nexline from 'nexline'
import * as fs from 'fs'
import { MonoBehaviourText, traversalOnMonoData, MonoObjectToken, Sqlite, MonoTable } from '../mono'
import { MonoToken } from '../mono'
import { listDirectory, fielExists, saveTo, saveJson, loadJson } from '../helper/helper'
import { inputPath, tsPath, dbPath } from '../../config'
import { DB_WHITE_LIST, TEXT_LABEL_TXT } from '../../should-parse-to-db'

const DB_FILE = 'output/db/dragatext.sqlite'
const WHITE_LIST: Array<string|RegExp> = DB_WHITE_LIST || []
const option = {
  only: process.argv.includes('--only') || false,
  noDB: process.argv.includes('--no-db')
}

let labels: any = {}
const dbHolder = dbPath
const tsHolder = tsPath
const inputHolder = inputPath
const db: Sqlite = new Sqlite(DB_FILE)
let tables: { [name: string]: MonoTable } = {}


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

const createSqlTable = async (token: MonoToken): Promise<any> => {
  if (!token.key.match(/Element$/)) {
    return false
  }
  const table = db.genCreateTable(token as MonoObjectToken)
  if (table) {
    tables[table.name] = table
  }
}

const insertEntityData = async (token: MonoToken): Promise<any> => {
  if (!token.key.match(/Element$/)) {
    return false
  }

  const name = token.key.replace(/Element$/, '')
  const table = tables[name]
  if (!table) {
    return false;
  }

  const sql = db.genInsertInto(table, token as MonoObjectToken, labels)
  try {
    if (sql && !option.noDB) {
      await db.run(sql)
    }
  } catch(e) {
    console.log(chalk.bold(sql))
    console.log(chalk.red(e))
  }
}

const processElementToken = async (token: MonoToken) => {
  if (!option.noDB) {
    await db.open()
  }

  tables = {}
  // create table
  await traversalOnMonoData(token, createSqlTable)
  if (Object.keys(tables).length > 1) {
    console.log(`\tmulti entity: ${chalk.red(JSON.stringify(Object.keys(db)))}`)
  }

  for (const key in tables) {
    const table = tables[key]
    console.log(`\t\tsave sql table ${chalk.greenBright(table.name)}`)
    await saveTo(table.sql, `${dbHolder}/table/${table.name}.sql`)
    await saveTo(table.orm, `${tsHolder}/${table.name}.ts`)
    try {
      if (!option.noDB) {
        await db.run(table.sql)
      }
    } catch(e) {
      console.log(chalk.bold(table.sql))
      console.log(chalk.red(e, e.stack))
    }
  }

  // insert into
  traversalOnMonoData(token, insertEntityData)

  if (!option.noDB) {
    await db.close()
  }
}


async function boot () {

  const labelCacheFile = `.${TEXT_LABEL_TXT}`
  // prepare text labels
  if (await fielExists(labelCacheFile)) {
    labels = await loadJson(labelCacheFile)
    console.log(chalk.green(`text label loaded from cache`))
  }
  else {
    const labelToken = await await parseText(`${inputHolder}/${TEXT_LABEL_TXT}`);
    await traversalOnMonoData(labelToken, storeLabel)
    await saveJson(labels, labelCacheFile)
    console.log(chalk.green(`text label parsed`))
  }


  if (option.only) {
    for (let index = 2; index < process.argv.length; index++) {
      if (!await fielExists(process.argv[index])) {
        continue
      }

      await processElementToken(
        await parseText(process.argv[index])
      )
    }
  }
  else {
    const files = await listDirectory(inputHolder)
    for (const file of files) {
      if (!WHITE_LIST.find(cond => file.match(cond))) {
        continue
      }

      await processElementToken(
        await parseText(`${inputHolder}/${file}`)
      )
    }
  }
}

boot()
