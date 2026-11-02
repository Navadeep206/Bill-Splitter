import { createRootRoute, Outlet } from '@tanstack/react-router'
import { NotFoundState } from '@/components/page-states'

export const Route = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => <NotFoundState />,
})
