export interface Pod {
  id: string
  title: string
  description: string
  image: string
  creators: Array<string>
  created_at: string
  clones: number
  isNew?: boolean
}
