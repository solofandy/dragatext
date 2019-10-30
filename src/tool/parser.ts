import chalk from 'chalk'
import nexline from 'nexline'
import * as fs from 'fs'
import { MonoBehaviour } from '../mono/parser'
import { generateMonoSchema, generateMonoJson, MonoToken, EOP } from '../mono/mono'
import { saveBson, saveJson, listDirectory } from '../helper/helper'
import { inputPath, schemaPath, jsonPath, bsonPath } from '../../config'



const option = {
  // dryRun: process.argv.includes('--dry-run') || false,
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

  const process = async (file: string) => {
    console.log(`\nprocessing ${chalk.greenBright(file)} ...`)
    const fd = fs.openSync(`${inputHolder}/${file}`, 'r')
    const reader = nexline({input: fd})
    const token = await MonoBehaviour.parse(reader, -1, {})

    if (token === EOP) {
      console.log(chalk.red(`[ERROR] file ${file} is empty`))
      return ;
    }

    if (option.saveJson || option.saveBson) {
      const json = generateMonoJson(token)
      if (option.saveJson) {
        const jsonFile = file.replace(/\..*$/, '.json')
        await saveJson(json, `${jsonHolder}/${jsonFile}`)
        console.log(`\tjson ${chalk.green(jsonFile)} saved`)
      }
      if (option.saveBson) {
        await saveBson(json, `${bsonHolder}/${file.replace(/\..*$/, '.bson')}`)
      }
    }

    if (option.saveSchema) {
      const schemaFile = file.replace(/\..*$/, '.schema')
      const shcema = generateMonoSchema(token, (token: MonoToken) => {
        const value = token.value as MonoToken[]
        console.log(`\t\tArray ${chalk.blue(token.key)} has ${chalk.blue(value.length + '')} entries(${chalk.blue(value[0].key)})`)
      })
      await saveJson(shcema, `${schemaHolder}/${schemaFile}`)
      console.log(`\tschema ${chalk.green(schemaFile)} saved`)
    }
  }

  const files = await listDirectory(inputHolder)
  for (const file of files) {
    await process(file)
  }
}


//console.log(process.argv)

boot()
