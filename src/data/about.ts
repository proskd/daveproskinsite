export type ExperienceEntry = {
  title: string
  company: string
  location: string
  dates: string
}

export type HobbyEntry = {
  name: string
  detail?: string
  image?: string
  imageAlt?: string
  portrait?: boolean
}

export const hobbies: HobbyEntry[] = [
  {
    name: 'Taekwondo',
    detail: 'Black belt, 1st Dan',
    image: '/hobbies/taekwondo.png',
    imageAlt: 'At a taekwondo competition podium with family',
    portrait: true,
  },
  {
    name: 'Scuba Diving',
    image: '/hobbies/travel.png',
    imageAlt: 'Scuba diving underwater',
  },
  {
    name: 'Rock climbing',
    image: '/hobbies/rock-climbing.png',
    imageAlt: 'Rappelling down a waterfall in Jamaica',
  },
  {
    name: 'Traveling',
    image: '/hobbies/traveling.png',
    imageAlt: 'Family in front of Cinderella Castle at Disney World',
    portrait: true,
  },
  {
    name: 'Cooking',
    image: '/hobbies/cooking.png',
    imageAlt: 'Making poke in the kitchen',
    portrait: true,
  },
  {
    name: 'Biking',
    image: '/hobbies/biking.png',
    imageAlt: 'Biking with family on a trail',
  },
  {
    name: 'Video games',
    detail: 'Especially retro ones',
    image: '/hobbies/video-games.png',
    imageAlt: 'On Buzz Lightyear Space Ranger Spin at Disney',
  },
]

export const experience: ExperienceEntry[] = [
  {
    title: 'Associate Director, Engineering',
    company: 'Wayfair',
    location: 'Boston, MA (remote)',
    dates: '2022–Present',
  },
  {
    title: 'Senior Manager, Engineering',
    company: 'Clear',
    location: 'New York, NY',
    dates: '2020–2022',
  },
  {
    title: 'Director, Engineering',
    company: 'Litify',
    location: 'Brooklyn, NY',
    dates: '2019–2020',
  },
  {
    title: 'Director, Mobile Engineering',
    company: 'Shutterfly',
    location: 'New York, NY',
    dates: '2013–2019',
  },
  {
    title: 'Co-Founder',
    company: 'Door To The North',
    location: 'Shelton, CT',
    dates: '2012–2013',
  },
  {
    title: 'Software Developer',
    company: 'Research In Motion',
    location: 'Milford, CT',
    dates: '2010–2012',
  },
  {
    title: 'Software Developer',
    company: 'DataViz',
    location: 'Milford, CT',
    dates: '2009–2010',
  },
  {
    title: 'Software Developer',
    company: 'Ai Squared',
    location: 'Manchester Center, VT',
    dates: '2005–2009',
  },
]
