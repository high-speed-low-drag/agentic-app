import { Compass } from 'lucide-react'
import { useRouteError } from 'react-router'
import { LinkButton, EmptyState } from '../components/ui'

export function NotFoundPage() {
  const err = useRouteError() as { statusText?: string; message?: string } | undefined
  return (
    <EmptyState
      className="h-full"
      icon={<Compass size={20} />}
      title={err ? 'Unexpected error' : 'Page not found'}
      description={err?.statusText ?? err?.message ?? 'The page you are looking for does not exist.'}
      action={
        <LinkButton to="/" variant="primary">
Back to cases
</LinkButton>
      }
    />
  )
}
