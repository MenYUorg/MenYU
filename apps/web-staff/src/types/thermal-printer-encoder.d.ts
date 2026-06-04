declare module 'thermal-printer-encoder' {
  interface EncoderOptions {
    language?: string
    width?: number
  }
  class ThermalPrinterEncoder {
    constructor(options?: EncoderOptions)
    initialize(): this
    align(value: 'left' | 'center' | 'right'): this
    bold(value: boolean): this
    line(value: string): this
    text(value: string): this
    rule(): this
    newline(): this
    cut(): this
    encode(): Uint8Array
  }
  export default ThermalPrinterEncoder
}
