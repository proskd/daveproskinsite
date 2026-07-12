export type ProjectEntry = {
  id: string
  name: string
  description: string
  technologies: string[]
  image: string
  imageAlt: string
  links: {
    label: string
    href: string
    external?: boolean
  }[]
}

export const projects: ProjectEntry[] = [
  {
    id: 'dominion-setup-assistant',
    name: 'Dominion Setup Assistant',
    description:
      'An iPhone app that helps players set up a game of Dominion. Choose which expansions you own, and the app picks a random kingdom card lineup for your next game. Designed, built, illustrated, and tested solo.',
    technologies: ['iOS', 'Objective-C', 'Swift'],
    image: '/projects/dominion-setup-assistant-icon.png',
    imageAlt: 'Dominion Setup Assistant app icon',
    links: [
      {
        label: 'View on the App Store',
        href: 'https://apps.apple.com/us/app/dominion-setup-assistant/id593609262',
        external: true,
      },
    ],
  },
]
