import { useState } from 'react'
import { Link as LinkIcon } from 'lucide-react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

export function RecipeImport({ onImport }) {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleImport = async () => {
    if (!url) return

    setIsLoading(true)
    // TODO: Implement URL import functionality
    // This would call a backend service to scrape recipe data
    setTimeout(() => {
      setIsLoading(false)
      alert('URL import feature coming soon!')
    }, 1000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <LinkIcon size={20} className="text-primary" />
        <h3 className="text-lg font-display font-bold text-text-primary">
          Import from URL
        </h3>
      </div>

      <p className="text-text-secondary font-body text-sm">
        Paste a recipe URL from popular cooking websites to automatically import the recipe details.
      </p>

      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com/recipe"
        label="Recipe URL"
      />

      <Button onClick={handleImport} disabled={!url || isLoading} className="w-full">
        {isLoading ? 'Importing...' : 'Import Recipe'}
      </Button>

      <div className="text-center text-sm text-text-secondary font-body">
        This feature is coming soon. For now, please add recipes manually.
      </div>
    </div>
  )
}
