import * as BSON from 'bson'
import { writeFile, readdir, stat } from 'fs'

export const saveJson = async (json: any, fileName: string) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(json, null, 2)
    writeFile(fileName, data, (err) => {
      if (err) {
        return reject(err)
      }
      resolve(true)
    })
  })
}

export const saveBson = async (json: any, fileName: string) => {
  return new Promise((resolve, reject) => {
    const data = BSON.serialize(json)
    writeFile(fileName, data, (err) => {
      if (err) {
        return reject(err)
      }
      resolve(true)
    })
  })
}

export const listDirectory = async (path: string): Promise<string[]> => {
  return new Promise((resolve: Function, reject: Function) => {
    readdir(path, (err: any, items: string[]) => {
      if(err) {
        reject(err)
      } else {
        resolve(items)
      }
    })
  })
}

export const fielExists = async (path: string): Promise<boolean> => {
  return new Promise((resolve: Function, reject: Function) => {
    stat(path, (err, stats) => {
      if (err) {
        resolve(false)
      } else {
        resolve(stats.isFile())
      }
    })
  })
}
