import chalk from 'chalk'
import nexline from 'nexline'
import * as fs from 'fs'
import { MonoBehaviour } from '../mono/parser'
import { generateMonoSchema, generateMonoJson, MonoToken, EOP } from '../mono/mono'
import { saveBson, saveJson, listDirectory, fielExists } from '../helper/helper'
import { inputPath, schemaPath, jsonPath, bsonPath } from '../../config'
import { basename } from 'path'

const option = {
  // dryRun: process.argv.includes('--dry-run') || false,
  only: process.argv.includes('--only') || false,
  saveJson: process.argv.includes('--save-json') || true,
  saveBson: process.argv.includes('--save-bson') || false,
  saveSchema: process.argv.includes('--save-schema') || true
}

const input = 'resources/master/AbilityData.txt'

async function boot() {
  const jsonHolder = jsonPath
  const bsonHolder = bsonPath
  const inputHolder = inputPath
  const schemaHolder = schemaPath

  const parseText = async (file: string) => {
    console.log(`\nprocessing ${chalk.greenBright(file)} ...`)
    const filebase = basename(file)
    const fd = fs.openSync(file, 'r')
    const reader = nexline({input: fd})
    const token = await MonoBehaviour.parse(reader, -1, {})
    fs.closeSync(fd)

    if (token === EOP) {
      console.log(chalk.red(`[ERROR] file ${file} is empty`))
      return ;
    }

    if (option.saveJson || option.saveBson) {
      const json = generateMonoJson(token)
      if (option.saveJson) {
        const jsonFile = filebase.replace(/\..*$/, '.json')
        await saveJson(json, `${jsonHolder}/${jsonFile}`)
        console.log(`\tjson ${chalk.green(jsonFile)} saved`)
      }
      if (option.saveBson) {
        await saveBson(json, `${bsonHolder}/${filebase.replace(/\..*$/, '.bson')}`)
      }
    }

    if (option.saveSchema) {
      const schemaFile = filebase.replace(/\..*$/, '.schema')
      const shcema = generateMonoSchema(token, (token: MonoToken) => {
        const value = token.value as MonoToken[]
        console.log(`\t\tArray ${chalk.blueBright(token.key)} has ${chalk.blueBright(value.length + '')} entries(${chalk.blueBright(value[0].key)})`)
      })
      await saveJson(shcema, `${schemaHolder}/${schemaFile}`)
      console.log(`\tschema ${chalk.green(schemaFile)} saved`)
    }
  }

  const files = await listDirectory(inputHolder)
  if (option.only) {
    for (let index = 2; index < process.argv.length; index++) {
      if (await fielExists(process.argv[index])) {
        await parseText(process.argv[index])
      }
    }
  }
  else {
    for (const file of files) {
      await parseText(`${inputHolder}/${file}`)
    }
  }
}

boot()
