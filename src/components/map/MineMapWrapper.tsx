'use client'

import dynamic from 'next/dynamic'
import { ComponentProps } from 'react'

const MineMap = dynamic(() => import('./MineMap'), {
  ssr: false,
  loading: () => <div className="h-[600px] w-full bg-slate-100 animate-pulse rounded-xl" />
})

export function MineMapWrapper(props: ComponentProps<typeof MineMap>) {
  return <MineMap {...props} />
}
