import chalk from 'chalk'
import nexline from 'nexline'
import * as fs from 'fs'
import { MonoBehaviour } from '../mono/parser'
import { generateMonoSchema, generateMonoJson, MonoToken, EOP, generateMonoTs } from '../mono/mono'
import { saveBson, saveJson, listDirectory, fielExists, saveTo } from '../helper/helper'
import { inputPath, schemaPath, jsonPath, bsonPath, tsPath } from '../../config'
import { basename } from 'path'

const option = {
  // dryRun: process.argv.includes('--dry-run') || false,
  only: process.argv.includes('--only') || false,
  saveTs: !process.argv.includes('--no-save-ts'),
  saveJson: !process.argv.includes('--no-save-json'),
  saveBson: process.argv.includes('--save-bson') || false,
  saveSchema: !process.argv.includes('--no-save-schema')
}

async function boot() {
  const tsHolder = tsPath
  const jsonHolder = jsonPath
  const bsonHolder = bsonPath
  const inputHolder = inputPath
  const schemaHolder = schemaPath

  const parseText = async (file: string) => {
    console.log(`\nprocessing ${chalk.greenBright(file)} ...`)
    const filebase = basename(file).toLowerCase()
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

    if (option.saveTs) {
      const types = {}
      generateMonoTs(token, types);
      for (const key in types) {
        const tsFile = `${tsHolder}/${key.toLowerCase()}.ts`
        // if (await fielExists(tsFile)) {
        //   console.log(chalk.red(`${tsFile} exists`))
        // }
        await saveTo(types[key], tsFile)
        console.log(`\tts ${chalk.green(tsFile)} saved`)
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

  if (option.only) {
    for (let index = 2; index < process.argv.length; index++) {
      if (await fielExists(process.argv[index])) {
        await parseText(process.argv[index])
      }
    }
  }
  else {
    const files = await listDirectory(inputHolder)
    for (const file of files) {
      await parseText(`${inputHolder}/${file}`)
    }
  }
}

boot()
