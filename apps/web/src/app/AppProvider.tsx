import { ChakraProvider } from '@chakra-ui/react'
import type { PropsWithChildren } from 'react'
import { system } from './theme'

export function AppProvider({ children }: PropsWithChildren) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>
}
