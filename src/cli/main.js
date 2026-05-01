import { Command } from 'commander'
export function buildMainProgram() {
    const program = new Command()
    program.name('foph').version('0.5.0').description('Foph — JS rebuild of hermes-agent')
    return program
}
export { buildMainProgram as createCli }
